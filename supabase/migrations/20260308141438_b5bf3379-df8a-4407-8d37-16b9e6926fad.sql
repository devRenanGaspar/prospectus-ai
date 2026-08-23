
-- 1. Create lead_searches table
CREATE TABLE public.lead_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quantity_requested integer NOT NULL,
  limit_per_niche integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  leads_found integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.lead_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own searches"
  ON public.lead_searches FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins access all searches"
  ON public.lead_searches FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- 2. Add search_id FK to leads
ALTER TABLE public.leads ADD COLUMN search_id uuid REFERENCES public.lead_searches(id);
