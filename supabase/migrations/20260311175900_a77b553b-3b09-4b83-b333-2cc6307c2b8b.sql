ALTER TABLE public.profiles
  ADD COLUMN google_calendar_refresh_token text,
  ADD COLUMN google_calendar_email text,
  ADD COLUMN google_calendar_connected_at timestamptz;