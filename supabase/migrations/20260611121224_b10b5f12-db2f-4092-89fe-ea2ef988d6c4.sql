
ALTER TABLE public.lead_searches
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

INSERT INTO public.credit_costs (action_name, cost)
VALUES ('FIND_LEAD_REFUND', 0)
ON CONFLICT (action_name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.refund_unused_search_credits(_search_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid;
  _qty integer;
  _found integer;
  _status text;
  _refunded_at timestamptz;
  _unit_cost integer;
  _unused integer;
  _refund_amount integer;
  _reason text;
BEGIN
  SELECT user_id, quantity_requested, COALESCE(leads_found, 0), status, refunded_at
    INTO _user_id, _qty, _found, _status, _refunded_at
  FROM public.lead_searches
  WHERE id = _search_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'SEARCH_NOT_FOUND');
  END IF;

  IF _refunded_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'skipped', true, 'reason', 'ALREADY_REFUNDED');
  END IF;

  IF _status NOT IN ('completed', 'failed') THEN
    RETURN jsonb_build_object('success', true, 'skipped', true, 'reason', 'STATUS_NOT_FINAL');
  END IF;

  SELECT cost INTO _unit_cost FROM public.credit_costs WHERE action_name = 'FIND_LEAD';
  IF _unit_cost IS NULL THEN _unit_cost := 1; END IF;

  IF _status = 'failed' THEN
    _unused := _qty;
    _reason := 'SEARCH_FAILED';
  ELSE
    _unused := GREATEST(_qty - _found, 0);
    _reason := 'PARTIAL_DELIVERY';
  END IF;

  _refund_amount := _unused * _unit_cost;

  IF _refund_amount > 0 THEN
    UPDATE public.profiles
       SET credits_balance = credits_balance + _refund_amount
     WHERE id = _user_id;

    INSERT INTO public.usage_logs (user_id, action_name, cost, lead_id, metadata)
    VALUES (
      _user_id, 'FIND_LEAD_REFUND', -_refund_amount, NULL,
      jsonb_build_object(
        'search_id', _search_id,
        'quantity_requested', _qty,
        'leads_found', _found,
        'unit_cost', _unit_cost,
        'refunded_units', _unused,
        'reason', _reason
      )
    );
  END IF;

  UPDATE public.lead_searches SET refunded_at = now() WHERE id = _search_id;

  RETURN jsonb_build_object('success', true, 'refunded', _refund_amount, 'unused_units', _unused, 'reason', _reason);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refund_unused_search_credits(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_unused_search_credits(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_refund_on_search_finalized()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.refund_unused_search_credits(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lead_searches_refund_on_finalize ON public.lead_searches;
CREATE TRIGGER lead_searches_refund_on_finalize
AFTER UPDATE OF status ON public.lead_searches
FOR EACH ROW
WHEN (
  NEW.status IN ('completed','failed')
  AND OLD.status IS DISTINCT FROM NEW.status
  AND NEW.refunded_at IS NULL
)
EXECUTE FUNCTION public.trg_refund_on_search_finalized();
