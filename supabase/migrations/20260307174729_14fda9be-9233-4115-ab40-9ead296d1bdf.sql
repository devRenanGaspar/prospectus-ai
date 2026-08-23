
-- 1. Add agency context columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN agency_name text DEFAULT '' NOT NULL,
  ADD COLUMN context_persona text,
  ADD COLUMN context_icp jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN context_qualification jsonb DEFAULT '{}'::jsonb;

-- 2. Migrate data from agencies to profiles
UPDATE public.profiles p
SET
  agency_name = a.name,
  context_persona = a.context_persona,
  context_icp = a.context_icp,
  context_qualification = a.context_qualification
FROM public.agencies a
WHERE a.user_id = p.id;

-- 3. Add user_id column to leads referencing profiles
ALTER TABLE public.leads
  ADD COLUMN user_id uuid REFERENCES public.profiles(id);

-- 4. Populate leads.user_id from agencies
UPDATE public.leads l
SET user_id = a.user_id
FROM public.agencies a
WHERE l.agency_id = a.id;

-- 5. Make user_id NOT NULL now that it's populated
ALTER TABLE public.leads
  ALTER COLUMN user_id SET NOT NULL;

-- 6. Drop old RLS policies on leads
DROP POLICY IF EXISTS "Users access own leads" ON public.leads;
DROP POLICY IF EXISTS "Admins access all leads" ON public.leads;

-- 7. Create new simple RLS policies on leads
CREATE POLICY "Users access own leads"
  ON public.leads FOR ALL
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins access all leads"
  ON public.leads FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- 8. Update messages RLS to use leads.user_id directly
DROP POLICY IF EXISTS "Users access own messages" ON public.messages;
DROP POLICY IF EXISTS "Admins access all messages" ON public.messages;

CREATE POLICY "Users access own messages"
  ON public.messages FOR ALL
  TO authenticated
  USING (lead_id IN (SELECT id FROM public.leads WHERE user_id = auth.uid()));

CREATE POLICY "Admins access all messages"
  ON public.messages FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- 9. Drop FK and column agency_id from leads
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_agency_id_fkey;
ALTER TABLE public.leads DROP COLUMN agency_id;

-- 10. Drop agencies table and its policies
DROP POLICY IF EXISTS "Users access own agencies" ON public.agencies;
DROP POLICY IF EXISTS "Admins access all agencies" ON public.agencies;
DROP TABLE public.agencies;

-- 11. Update handle_new_user to initialize agency_name
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, credits_balance, agency_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'USER',
    100,
    ''
  );
  RETURN NEW;
END;
$$;
