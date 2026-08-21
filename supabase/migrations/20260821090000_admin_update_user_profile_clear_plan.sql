-- ============================================================================
-- admin_update_user_profile: distinguish "not provided" from "clear this field"
-- ============================================================================
-- The function coalesces _plan_id back onto the existing column whenever the
-- caller sends NULL, so there was no way to actually unset a user's plan.
-- The admin UI already offers "Nenhum (Trial)" for exactly that, wired to
-- plan_id: null -- which this function silently ignored while still
-- returning success.
--
-- _clear_plan is a separate boolean rather than a sentinel UUID so the intent
-- is explicit at the call site and the client can still omit _plan_id
-- entirely for "leave it alone", the same as every other field here.
--
-- Recreated with DROP + CREATE (not an overload) so exactly one signature of
-- this function exists at a time -- see OPS-003 in the risk register for what
-- happens when a function accumulates parallel signatures with only one of
-- them reachable from the app.
-- ============================================================================

DROP FUNCTION IF EXISTS public.admin_update_user_profile(uuid, text, integer, uuid, text, text, text);

CREATE FUNCTION public.admin_update_user_profile(
  _id uuid,
  _role text DEFAULT NULL::text,
  _credits_balance integer DEFAULT NULL::integer,
  _plan_id uuid DEFAULT NULL::uuid,
  _full_name text DEFAULT NULL::text,
  _email text DEFAULT NULL::text,
  _sdr_phone text DEFAULT NULL::text,
  _clear_plan boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Permission denied: admin only'; END IF;
  IF _role IS NOT NULL AND _role NOT IN ('USER', 'ADMIN', 'BLOCKED') THEN RAISE EXCEPTION 'Invalid role'; END IF;
  IF _credits_balance IS NOT NULL AND _credits_balance < 0 THEN RAISE EXCEPTION 'Invalid credits balance'; END IF;

  UPDATE public.profiles SET
    role = COALESCE(_role, role),
    credits_balance = COALESCE(_credits_balance, credits_balance),
    plan_id = CASE
                WHEN _clear_plan THEN NULL
                WHEN _plan_id IS NOT NULL THEN _plan_id
                ELSE plan_id
              END,
    full_name = COALESCE(_full_name, full_name),
    email = COALESCE(_email, email),
    sdr_phone = COALESCE(_sdr_phone, sdr_phone)
  WHERE id = _id;
END $function$;

-- ALTER DEFAULT PRIVILEGES (20260805155213) revokes EXECUTE from PUBLIC,
-- anon and authenticated for every function `postgres` creates from here on.
-- A DROP + CREATE without an explicit grant would leave this function
-- uncallable by the admin panel itself -- the previous definition carried
-- this same grant for the same reason.
REVOKE ALL ON FUNCTION public.admin_update_user_profile(uuid, text, integer, uuid, text, text, text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user_profile(uuid, text, integer, uuid, text, text, text, boolean)
  TO authenticated;
