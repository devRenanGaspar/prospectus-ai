
CREATE TABLE public.lead_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  author_name text NOT NULL,
  commented_at timestamptz NOT NULL DEFAULT now(),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users CRUD own lead comments"
  ON public.lead_comments
  FOR ALL
  TO authenticated
  USING (lead_id IN (SELECT id FROM public.leads WHERE user_id = auth.uid()));

CREATE POLICY "Admins read all lead comments"
  ON public.lead_comments
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));
