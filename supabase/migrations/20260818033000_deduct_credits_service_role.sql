-- ============================================================================
-- deduct_credits / deduct_credits_bulk could never succeed. Fixing the guard
-- so it matches the grant.
--
-- The four signatures all opened with:
--
--   IF auth.uid() IS DISTINCT FROM _user_id THEN RAISE EXCEPTION 'Permission denied'
--
-- while EXECUTE is granted to `service_role` only -- revoked from `anon` and
-- `authenticated`. A service-role caller has no JWT, so `auth.uid()` is NULL,
-- and `NULL IS DISTINCT FROM <uuid>` is true. The one role allowed to call
-- these functions was the one role that could never satisfy their first line.
--
-- Measured before changing anything: 24 of 24 calls from `n8n-proxy` failed
-- between 2026-08-15 and 2026-08-18 (`operational_events`, action
-- `deduct_credits`, all `DATABASE_ERROR`). The caller is the SDR agent's
-- "System - Credit Debit" node, and its n8n executions report success because
-- the workflow swallows the error -- which is why this was invisible. The
-- charge is intended: the agent's reply is a paid action.
--
-- The fix keeps the protection that was meant to be there. `auth.uid()` is
-- only compared when there *is* one, so a caller holding a JWT still cannot
-- debit anyone but themselves; a service-role caller, which is trusted server
-- code, passes. `is_active_user()` is untouched and still refuses BLOCKED
-- accounts.
--
-- Both directions were verified against production inside rolled-back
-- transactions before this was applied:
--   - as `service_role`            -> {"success": true, "cost": 1, ...}
--   - with a JWT for another user  -> still raises 'Permission denied'
--
-- All four signatures are updated rather than only the two `n8n-proxy` calls,
-- because leaving the short forms with the contradiction is how the same trap
-- gets re-found later. (They are separately unreachable: calling them without
-- the trailing argument raises 42725 `function is not unique` -- reproduced.
-- Whether they should exist at all is tracked as OPS-003.)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.deduct_credits(_user_id uuid, _action_name text, _lead_id uuid DEFAULT NULL::uuid, _metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _cost integer; _balance integer; _new_balance integer;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM _user_id THEN RAISE EXCEPTION 'Permission denied'; END IF;
  IF NOT public.is_active_user(_user_id) THEN RAISE EXCEPTION 'Permission denied'; END IF;
  SELECT cost INTO _cost FROM public.credit_costs WHERE action_name = _action_name;
  IF _cost IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'ACTION_NOT_FOUND'); END IF;
  SELECT credits_balance INTO _balance FROM public.profiles WHERE id = _user_id FOR UPDATE;
  IF _balance IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND'); END IF;
  IF _balance < _cost THEN RETURN jsonb_build_object('success', false, 'error', 'INSUFFICIENT_CREDITS', 'balance', _balance, 'cost', _cost); END IF;
  _new_balance := _balance - _cost;
  UPDATE public.profiles SET credits_balance = _new_balance WHERE id = _user_id;
  INSERT INTO public.usage_logs (user_id, action_name, cost, lead_id, metadata)
  VALUES (_user_id, _action_name, _cost, _lead_id, _metadata);
  RETURN jsonb_build_object('success', true, 'new_balance', _new_balance, 'cost', _cost);
END; $function$;

CREATE OR REPLACE FUNCTION public.deduct_credits(_user_id uuid, _action_name text, _lead_id uuid DEFAULT NULL::uuid, _metadata jsonb DEFAULT '{}'::jsonb, _phone text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _cost integer; _balance integer; _new_balance integer;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM _user_id THEN RAISE EXCEPTION 'Permission denied'; END IF;
  IF NOT public.is_active_user(_user_id) THEN RAISE EXCEPTION 'Permission denied'; END IF;
  SELECT cost INTO _cost FROM public.credit_costs WHERE action_name = _action_name;
  IF _cost IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'ACTION_NOT_FOUND'); END IF;
  SELECT credits_balance INTO _balance FROM public.profiles WHERE id = _user_id FOR UPDATE;
  IF _balance IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND'); END IF;
  IF _balance < _cost THEN RETURN jsonb_build_object('success', false, 'error', 'INSUFFICIENT_CREDITS', 'balance', _balance, 'cost', _cost); END IF;
  _new_balance := _balance - _cost;
  UPDATE public.profiles SET credits_balance = _new_balance WHERE id = _user_id;
  INSERT INTO public.usage_logs (user_id, action_name, cost, lead_id, metadata, phone)
  VALUES (_user_id, _action_name, _cost, _lead_id, _metadata, _phone);
  RETURN jsonb_build_object('success', true, 'new_balance', _new_balance, 'cost', _cost);
END; $function$;

CREATE OR REPLACE FUNCTION public.deduct_credits_bulk(_user_id uuid, _action_name text, _quantity integer, _lead_id uuid DEFAULT NULL::uuid, _metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _unit_cost integer; _total_cost integer; _balance integer; _new_balance integer;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM _user_id THEN RAISE EXCEPTION 'Permission denied'; END IF;
  IF NOT public.is_active_user(_user_id) THEN RAISE EXCEPTION 'Permission denied'; END IF;
  IF _quantity < 1 THEN RETURN jsonb_build_object('success', false, 'error', 'INVALID_QUANTITY'); END IF;
  SELECT cost INTO _unit_cost FROM public.credit_costs WHERE action_name = _action_name;
  IF _unit_cost IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'ACTION_NOT_FOUND'); END IF;
  _total_cost := _unit_cost * _quantity;
  SELECT credits_balance INTO _balance FROM public.profiles WHERE id = _user_id FOR UPDATE;
  IF _balance IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND'); END IF;
  IF _balance < _total_cost THEN RETURN jsonb_build_object('success', false, 'error', 'INSUFFICIENT_CREDITS', 'balance', _balance, 'cost', _total_cost); END IF;
  _new_balance := _balance - _total_cost;
  UPDATE public.profiles SET credits_balance = _new_balance WHERE id = _user_id;
  INSERT INTO public.usage_logs (user_id, action_name, cost, lead_id, metadata)
  VALUES (_user_id, _action_name, _total_cost, _lead_id, _metadata || jsonb_build_object('quantity', _quantity, 'unit_cost', _unit_cost));
  RETURN jsonb_build_object('success', true, 'new_balance', _new_balance, 'cost', _total_cost, 'unit_cost', _unit_cost, 'quantity', _quantity);
END; $function$;

CREATE OR REPLACE FUNCTION public.deduct_credits_bulk(_user_id uuid, _action_name text, _quantity integer, _lead_id uuid DEFAULT NULL::uuid, _metadata jsonb DEFAULT '{}'::jsonb, _phone text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _unit_cost integer; _total_cost integer; _balance integer; _new_balance integer;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM _user_id THEN RAISE EXCEPTION 'Permission denied'; END IF;
  IF NOT public.is_active_user(_user_id) THEN RAISE EXCEPTION 'Permission denied'; END IF;
  IF _quantity < 1 THEN RETURN jsonb_build_object('success', false, 'error', 'INVALID_QUANTITY'); END IF;
  SELECT cost INTO _unit_cost FROM public.credit_costs WHERE action_name = _action_name;
  IF _unit_cost IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'ACTION_NOT_FOUND'); END IF;
  _total_cost := _unit_cost * _quantity;
  SELECT credits_balance INTO _balance FROM public.profiles WHERE id = _user_id FOR UPDATE;
  IF _balance IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND'); END IF;
  IF _balance < _total_cost THEN RETURN jsonb_build_object('success', false, 'error', 'INSUFFICIENT_CREDITS', 'balance', _balance, 'cost', _total_cost); END IF;
  _new_balance := _balance - _total_cost;
  UPDATE public.profiles SET credits_balance = _new_balance WHERE id = _user_id;
  INSERT INTO public.usage_logs (user_id, action_name, cost, lead_id, metadata, phone)
  VALUES (_user_id, _action_name, _total_cost, _lead_id, _metadata || jsonb_build_object('quantity', _quantity, 'unit_cost', _unit_cost), _phone);
  RETURN jsonb_build_object('success', true, 'new_balance', _new_balance, 'cost', _total_cost, 'unit_cost', _unit_cost, 'quantity', _quantity);
END; $function$;

-- A migration that silently does nothing is the defect this whole audit keeps
-- finding, so this one refuses to pass unless every signature was rewritten.
DO $$
DECLARE _stale integer;
BEGIN
  SELECT count(*) INTO _stale
  FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace
    AND proname IN ('deduct_credits', 'deduct_credits_bulk')
    AND prosrc LIKE '%IF auth.uid() IS DISTINCT FROM _user_id%';

  IF _stale > 0 THEN
    RAISE EXCEPTION 'deduct_credits guard still self-contradictory in % signature(s)', _stale;
  END IF;
END $$;
