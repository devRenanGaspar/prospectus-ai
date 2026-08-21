-- Block direct UPDATE of credits_balance and plan_id by authenticated users
REVOKE UPDATE (credits_balance, plan_id) ON public.profiles FROM authenticated;

-- Admin RPC to update profiles (replaces direct client update for admins)
CREATE OR REPLACE FUNCTION public.admin_update_user_profile(
  _id uuid,
  _role text DEFAULT NULL,
  _credits_balance integer DEFAULT NULL,
  _plan_id uuid DEFAULT NULL,
  _full_name text DEFAULT NULL,
  _email text DEFAULT NULL,
  _sdr_phone text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;
  UPDATE public.profiles SET
    role             = COALESCE(_role, role),
    credits_balance  = COALESCE(_credits_balance, credits_balance),
    plan_id          = CASE WHEN _plan_id IS NOT NULL THEN _plan_id ELSE plan_id END,
    full_name        = COALESCE(_full_name, full_name),
    email            = COALESCE(_email, email),
    sdr_phone        = COALESCE(_sdr_phone, sdr_phone)
  WHERE id = _id;
END $$;

REVOKE ALL ON FUNCTION public.admin_update_user_profile(uuid,text,integer,uuid,text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_update_user_profile(uuid,text,integer,uuid,text,text,text) TO authenticated;