-- 1. Drop the permissive SELECT policy on public.messages
DROP POLICY IF EXISTS "Authenticated can use realtime" ON public.messages;

-- 2. Replace permissive realtime.messages policy with topic-scoped one
DROP POLICY IF EXISTS "Authenticated users can use realtime" ON realtime.messages;
DROP POLICY IF EXISTS "authenticated_can_use_realtime" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated can subscribe to realtime" ON realtime.messages;

-- Allow only authenticated users to subscribe to lead-scoped topics they own.
-- Topic convention used by client: "messages-<lead_id>"
CREATE POLICY "Users subscribe to own lead topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  (realtime.topic() LIKE 'messages-%')
  AND EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id::text = substring(realtime.topic() from 10)
      AND l.user_id = (SELECT auth.uid())
  )
);
