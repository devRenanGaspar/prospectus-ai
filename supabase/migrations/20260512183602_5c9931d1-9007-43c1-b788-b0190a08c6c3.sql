-- 1) Remove permissive realtime SELECT policy that exposed all messages
DROP POLICY IF EXISTS "Authenticated can use realtime" ON public.messages;

-- 2) Revoke column-level UPDATE/SELECT on sensitive OAuth token from clients
REVOKE UPDATE (google_calendar_refresh_token) ON public.profiles FROM anon, authenticated;
REVOKE SELECT (google_calendar_refresh_token) ON public.profiles FROM anon, authenticated;