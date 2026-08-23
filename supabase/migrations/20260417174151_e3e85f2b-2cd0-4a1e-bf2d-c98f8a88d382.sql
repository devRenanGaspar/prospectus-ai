
CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read announcements"
  ON public.announcements FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage announcements"
  ON public.announcements FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE INDEX idx_announcements_active_created ON public.announcements (is_active, created_at);

CREATE TABLE public.announcement_dismissals (
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);

ALTER TABLE public.announcement_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own dismissals"
  ON public.announcement_dismissals FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins read all dismissals"
  ON public.announcement_dismissals FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE INDEX idx_dismissals_user ON public.announcement_dismissals (user_id);
