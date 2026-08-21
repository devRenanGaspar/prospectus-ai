
ALTER TABLE public.plans ADD COLUMN payment_link text;

CREATE TABLE public.credit_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credits integer NOT NULL,
  price numeric NOT NULL,
  payment_link text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read active credit packages"
  ON public.credit_packages FOR SELECT TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage credit packages"
  ON public.credit_packages FOR ALL TO authenticated
  USING (is_admin(auth.uid()));
