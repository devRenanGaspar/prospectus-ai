-- Secure function to deduct credits with concurrency safety
CREATE OR REPLACE FUNCTION public.deduct_credits(
  _user_id uuid,
  _action_name text,
  _lead_id uuid DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cost integer;
  _balance integer;
  _new_balance integer;
BEGIN
  -- Get the cost for this action
  SELECT cost INTO _cost FROM public.credit_costs WHERE action_name = _action_name;
  IF _cost IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'ACTION_NOT_FOUND');
  END IF;

  -- Lock the profile row and get current balance
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

  -- Deduct
  UPDATE public.profiles SET credits_balance = _new_balance WHERE id = _user_id;

  -- Log usage
  INSERT INTO public.usage_logs (user_id, action_name, cost, lead_id, metadata)
  VALUES (_user_id, _action_name, _cost, _lead_id, _metadata);

  RETURN jsonb_build_object('success', true, 'new_balance', _new_balance, 'cost', _cost);
END;
$$;