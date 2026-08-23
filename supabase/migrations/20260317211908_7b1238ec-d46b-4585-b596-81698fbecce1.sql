
CREATE TABLE public.niche_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.niche_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active niches"
  ON public.niche_options FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage niches"
  ON public.niche_options FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()));

INSERT INTO public.niche_options (name, sort_order) VALUES
  ('Médicos', 1),
  ('Salão de Beleza', 2),
  ('Advogados', 3);
