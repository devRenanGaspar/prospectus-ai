
CREATE TABLE public.copy_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_ids uuid[] NOT NULL,
  status text NOT NULL DEFAULT 'processing',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.copy_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own copy_requests"
  ON public.copy_requests FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins access all copy_requests"
  ON public.copy_requests FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));
