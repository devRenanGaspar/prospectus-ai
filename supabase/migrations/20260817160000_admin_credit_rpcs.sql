-- ============================================================================
-- Atomic credit-mutation RPCs for n8n-proxy's admin actions.
--
-- add_credits and renew_subscription both did a JS-side
-- select-credits-then-update-credits, with no row lock -- a classic
-- read-modify-write race. request_send / request_copy / request_find_leads
-- already do this correctly in SQL with FOR UPDATE; these two admin actions
-- did not follow that pattern.
--
-- renew_subscription additionally applies a cap (credits_applied =
-- min(requested, cap_limit - balance_before)), computed in JS between the
-- read and the write -- a naive atomic increment would ignore the cap, so it
-- gets its own RPC rather than reusing admin_add_credits. The idempotency
-- guard (subscription_events.idempotency_key, unique) already serializes
-- retries of the *same* renewal event; this RPC closes the separate race
-- between *different* concurrent events for the same user racing on the
-- balance itself.
--
-- This RPC does not touch subscriptions or subscription_events -- only the
-- balance read-modify-write, which is the part that was unprotected. The
-- edge function keeps resolving the auth user, claiming the idempotency
-- slot, and upserting the subscription row exactly as before.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_add_credits(_user_id uuid, _amount integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_balance integer;
BEGIN
  IF _amount IS NULL OR _amount < 1 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  UPDATE public.profiles
  SET credits_balance = credits_balance + _amount
  WHERE id = _user_id
  RETURNING credits_balance INTO _new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND';
  END IF;

  RETURN jsonb_build_object('success', true, 'new_balance', _new_balance);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_apply_subscription_credits(
  _user_id uuid,
  _plan_id uuid,
  _credits_requested integer,
  _cap_limit integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _balance_before integer;
  _room_available  integer;
  _credits_applied integer;
  _credits_capped  integer;
  _balance_after   integer;
BEGIN
  IF _credits_requested IS NULL OR _credits_requested < 0 THEN
    RAISE EXCEPTION 'INVALID_CREDITS_REQUESTED';
  END IF;
  IF _cap_limit IS NULL OR _cap_limit < 0 THEN
    RAISE EXCEPTION 'INVALID_CAP_LIMIT';
  END IF;

  SELECT credits_balance INTO _balance_before
  FROM public.profiles
  WHERE id = _user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND';
  END IF;

  _balance_before := coalesce(_balance_before, 0);
  _room_available := greatest(0, _cap_limit - _balance_before);
  _credits_applied := least(_credits_requested, _room_available);
  _credits_capped := _credits_requested - _credits_applied;
  _balance_after := _balance_before + _credits_applied;

  -- plan_id and credits_balance in the same UPDATE as the original JS code
  -- did, so this stays one atomic write -- not two RPCs that could partially
  -- fail between them.
  UPDATE public.profiles
  SET credits_balance = _balance_after, plan_id = _plan_id
  WHERE id = _user_id;

  RETURN jsonb_build_object(
    'success', true,
    'balance_before', _balance_before,
    'credits_applied', _credits_applied,
    'credits_capped', _credits_capped,
    'balance_after', _balance_after
  );
END;
$$;

-- service_role only. The default-privileges migration (20260805155213)
-- already revokes EXECUTE from PUBLIC/anon/authenticated for functions
-- created by postgres; these grants are explicit for the same reason every
-- other money RPC in this codebase has them -- a reader auditing one
-- function in isolation should not have to know it depends on a schema-wide
-- default set in a different file, on a different date.
REVOKE ALL ON FUNCTION public.admin_add_credits(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_apply_subscription_credits(uuid, uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_credits(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_apply_subscription_credits(uuid, uuid, integer, integer) TO service_role;
