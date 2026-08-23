-- ============================================================================
-- fail_copy_request(): refunds a stuck copy_request, mirroring fail_search().
--
-- useCopyRequest.ts's webhook-failure handler called .catch() on
-- supabase.functions.invoke(), which -- verified by reading
-- @supabase/functions-js's FunctionsClient.ts -- never fires for an HTTP,
-- relay or network error: invoke() resolves those as { data: null, error }
-- instead of rejecting. The .catch() was effectively dead code, so a failed
-- webhook charged credits and left the leads in COPY_PENDING forever. The
-- fix on the client side (checking the resolved `error` field instead) is a
-- separate, frontend-only change; this migration is the RPC it calls.
--
-- copy_requests has no cost column and no refund trigger (unlike
-- lead_searches, which has trg_refund_on_search_finalized). request_copy()
-- writes the exact amount charged into usage_logs.metadata->>'copy_request_id'
-- -- that logged amount, not credit_costs at refund time, is what gets
-- refunded, so a price change between charge and refund can't create a
-- mismatch.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fail_copy_request(_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid          uuid := auth.uid();
  _owner        uuid;
  _status       text;
  _lead_ids     uuid[];
  _refund_units integer;
  _refund_cost  integer;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  SELECT user_id, status, lead_ids INTO _owner, _status, _lead_ids
  FROM public.copy_requests
  WHERE id = _request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'REQUEST_NOT_FOUND');
  END IF;

  IF _owner IS DISTINCT FROM _uid THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  -- Idempotent: only acts on a request still being worked. This is also the
  -- clawback guard's other half -- see update_copy_request_status below,
  -- which takes the same lock on the same row before marking a request
  -- completed. Whichever side gets here first wins; the loser sees a status
  -- that is no longer 'processing' and backs off instead of double-acting.
  IF _status IS DISTINCT FROM 'processing' THEN
    RETURN jsonb_build_object('success', true, 'skipped', true, 'reason', 'NOT_ACTIVE', 'status', _status);
  END IF;

  -- Refund exactly what was charged (usage_logs.cost, written by
  -- request_copy as unit_cost * quantity at charge time), not what
  -- GENERATE_COPY costs right now -- the two can diverge if credit_costs
  -- changed since.
  SELECT cost INTO _refund_cost
  FROM public.usage_logs
  WHERE action_name = 'GENERATE_COPY'
    AND metadata->>'copy_request_id' = _request_id::text
  ORDER BY "timestamp" DESC
  LIMIT 1;

  IF _refund_cost IS NULL THEN
    -- No matching charge found -- nothing to refund, but the request is
    -- still stuck. Close it out without moving credits.
    UPDATE public.copy_requests SET status = 'failed' WHERE id = _request_id;
    RETURN jsonb_build_object('success', true, 'refunded', 0, 'reason', 'NO_CHARGE_FOUND');
  END IF;

  UPDATE public.profiles
  SET credits_balance = credits_balance + _refund_cost
  WHERE id = _uid;

  INSERT INTO public.usage_logs (user_id, action_name, cost, lead_id, metadata)
  VALUES (
    _uid, 'GENERATE_COPY_REFUND', -_refund_cost, NULL,
    jsonb_build_object('copy_request_id', _request_id, 'reason', 'WEBHOOK_FAILED')
  );

  UPDATE public.copy_requests SET status = 'failed' WHERE id = _request_id;

  -- Only this request's own leads, and only the ones that never advanced --
  -- not every COPY_PENDING lead the user has.
  UPDATE public.leads
  SET status = 'NEW', updated_at = now()
  WHERE id = ANY(_lead_ids)
    AND status = 'COPY_PENDING';
  GET DIAGNOSTICS _refund_units = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'refunded', _refund_cost,
    'leads_restored', _refund_units
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fail_copy_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fail_copy_request(uuid) TO authenticated;

-- ============================================================================
-- The other half of the clawback guard: n8n's completion callback
-- (update_copy_request_status in n8n-proxy) now takes the same row lock
-- before marking a request 'completed', and refuses if fail_copy_request
-- already claimed it. Same ordering as
-- close_fail_search_clawback_race.sql -- both sides lock copy_requests
-- first, so there is no cross-lock deadlock, and whichever transaction
-- arrives first wins.
--
-- Known, deliberate gap: this closes the race on copy_requests.status
-- itself, but the lead-visible "delivery" -- a lead actually reaching
-- COPY_READY with generated copy attached -- happens through n8n-proxy's
-- generic update_lead / update_lead_status actions, which are not aware of
-- copy_request_id at all. Retrofitting that would mean either coupling a
-- fully generic per-lead endpoint to one caller's semantics, or having the
-- n8n workflow start passing copy_request_id on the completion call -- a
-- contract change outside this repository, the same category of dependency
-- M3's token rollout has. Not attempted here; recorded as a follow-up.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.complete_copy_request(_request_id uuid, _status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_status text;
BEGIN
  IF _status NOT IN ('processing', 'completed', 'failed') THEN
    RAISE EXCEPTION 'INVALID_STATUS';
  END IF;

  SELECT status INTO _current_status
  FROM public.copy_requests
  WHERE id = _request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'REQUEST_NOT_FOUND');
  END IF;

  IF _current_status <> 'processing' THEN
    RETURN jsonb_build_object('success', false, 'error', 'COPY_ALREADY_FAILED', 'status', _current_status);
  END IF;

  UPDATE public.copy_requests SET status = _status WHERE id = _request_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_copy_request(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_copy_request(uuid, text) TO service_role;
