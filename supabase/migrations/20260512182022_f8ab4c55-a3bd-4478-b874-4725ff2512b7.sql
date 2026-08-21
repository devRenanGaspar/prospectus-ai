
-- 1) Prevent role self-escalation via trigger
CREATE OR REPLACE FUNCTION public.prevent_role_self_escalation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Permission denied: cannot change role';
  END IF;
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.prevent_role_self_escalation() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_prevent_role_escalation ON public.profiles;
CREATE TRIGGER profiles_prevent_role_escalation
BEFORE UPDATE OF role ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_role_self_escalation();

-- 2) Hide google_calendar_refresh_token from clients (column-level)
REVOKE SELECT (google_calendar_refresh_token) ON public.profiles FROM anon, authenticated;
REVOKE UPDATE (google_calendar_refresh_token) ON public.profiles FROM anon, authenticated;

-- 3) webhook_configs: restrict reads to admins only
DROP POLICY IF EXISTS "Authenticated users can read active webhooks" ON public.webhook_configs;

-- 4) usage_logs: remove user insert (only service_role / SECURITY DEFINER RPCs write)
DROP POLICY IF EXISTS "Users can insert own usage" ON public.usage_logs;

-- 5) realtime.messages: add authenticated-only baseline policy
-- Wrapped defensively: already applied on production, where the migration
-- role owns realtime.messages. A fresh local/CI replay (`supabase start`)
-- uses a role that does not own it, and a hard ALTER here aborted the whole
-- migration chain -- including every migration and this repo's own tables
-- after it -- before it ever got a chance to apply (confirmed: SQLSTATE
-- 42501, "must be owner of table messages"). This only changes behavior for
-- environments where the ALTER would otherwise hard-fail.
DO $$
BEGIN
  BEGIN
    ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Authenticated can use realtime" ON realtime.messages;
    CREATE POLICY "Authenticated can use realtime"
      ON realtime.messages
      FOR SELECT
      TO authenticated
      USING (true);
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'Skipped realtime.messages RLS/policy: insufficient privilege (expected on a fresh local/CI replay)';
  END;
END $$;
