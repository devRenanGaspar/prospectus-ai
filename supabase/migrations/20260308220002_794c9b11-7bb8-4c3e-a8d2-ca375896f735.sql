
CREATE TABLE public.send_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lead_ids uuid[] NOT NULL,
  status text NOT NULL DEFAULT 'processing',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.send_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own send_requests"
  ON public.send_requests FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins access all send_requests"
  ON public.send_requests FOR SELECT TO authenticated
  USING (is_admin(auth.uid()));
