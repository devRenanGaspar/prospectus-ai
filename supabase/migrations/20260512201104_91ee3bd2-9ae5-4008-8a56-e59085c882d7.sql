-- Remove all known permissive policies on realtime.messages
DROP POLICY IF EXISTS "Authenticated can use realtime" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated users can use realtime" ON realtime.messages;
DROP POLICY IF EXISTS "authenticated_can_use_realtime" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated can subscribe to realtime" ON realtime.messages;

-- Recreate topic-scoped messages policy (idempotent)
DROP POLICY IF EXISTS "Users subscribe to own lead topics" ON realtime.messages;
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

-- Allow authenticated users to subscribe only to their own leads topic
DROP POLICY IF EXISTS "Users subscribe to own leads topic" ON realtime.messages;
CREATE POLICY "Users subscribe to own leads topic"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  (realtime.topic() LIKE 'leads-%')
  AND substring(realtime.topic() from 7) = (SELECT auth.uid())::text
);

-- Allow authenticated users to subscribe to global maintenance topic
DROP POLICY IF EXISTS "Authenticated can subscribe to maintenance" ON realtime.messages;
CREATE POLICY "Authenticated can subscribe to maintenance"
ON realtime.messages
FOR SELECT
TO authenticated
USING (realtime.topic() = 'app-settings-maintenance');