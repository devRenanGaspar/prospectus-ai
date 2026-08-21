
-- Fix the overly permissive INSERT policy on profiles
-- The trigger runs as SECURITY DEFINER so it bypasses RLS anyway
-- Restrict manual inserts to the user's own ID
DROP POLICY "Allow insert for trigger" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
