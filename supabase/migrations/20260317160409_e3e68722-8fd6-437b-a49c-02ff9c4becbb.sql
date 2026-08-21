
-- 1. Add phone column
ALTER TABLE public.usage_logs ADD COLUMN phone text DEFAULT NULL;

-- 2. Recreate deduct_credits with _phone parameter
CREATE OR REPLACE FUNCTION public.deduct_credits(_user_id uuid, _action_name text, _lead_id uuid DEFAULT NULL::uuid, _metadata jsonb DEFAULT '{}'::jsonb, _phone text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _cost integer;
  _balance integer;
  _new_balance integer;
BEGIN
  SELECT cost INTO _cost FROM public.credit_costs WHERE action_name = _action_name;
  IF _cost IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'ACTION_NOT_FOUND');
  END IF;

  SELECT credits_balance INTO _balance
  FROM public.profiles
  WHERE id = _user_id
  FOR UPDATE;

  IF _balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND');
  END IF;

  IF _balance < _cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'INSUFFICIENT_CREDITS', 'balance', _balance, 'cost', _cost);
  END IF;

  _new_balance := _balance - _cost;

  UPDATE public.profiles SET credits_balance = _new_balance WHERE id = _user_id;

  INSERT INTO public.usage_logs (user_id, action_name, cost, lead_id, metadata, phone)
  VALUES (_user_id, _action_name, _cost, _lead_id, _metadata, _phone);

  RETURN jsonb_build_object('success', true, 'new_balance', _new_balance, 'cost', _cost);
END;
$function$;

-- 3. Recreate deduct_credits_bulk with _phone parameter
CREATE OR REPLACE FUNCTION public.deduct_credits_bulk(_user_id uuid, _action_name text, _quantity integer, _lead_id uuid DEFAULT NULL::uuid, _metadata jsonb DEFAULT '{}'::jsonb, _phone text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _unit_cost integer;
  _total_cost integer;
  _balance integer;
  _new_balance integer;
BEGIN
  IF _quantity < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_QUANTITY');
  END IF;

  SELECT cost INTO _unit_cost FROM public.credit_costs WHERE action_name = _action_name;
  IF _unit_cost IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'ACTION_NOT_FOUND');
  END IF;

  _total_cost := _unit_cost * _quantity;

  SELECT credits_balance INTO _balance
  FROM public.profiles
  WHERE id = _user_id
  FOR UPDATE;

  IF _balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND');
  END IF;

  IF _balance < _total_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'INSUFFICIENT_CREDITS', 'balance', _balance, 'cost', _total_cost);
  END IF;

  _new_balance := _balance - _total_cost;

  UPDATE public.profiles SET credits_balance = _new_balance WHERE id = _user_id;

  INSERT INTO public.usage_logs (user_id, action_name, cost, lead_id, metadata, phone)
  VALUES (_user_id, _action_name, _total_cost, _lead_id, _metadata || jsonb_build_object('quantity', _quantity, 'unit_cost', _unit_cost), _phone);

  RETURN jsonb_build_object('success', true, 'new_balance', _new_balance, 'cost', _total_cost, 'unit_cost', _unit_cost, 'quantity', _quantity);
END;
$function$;
