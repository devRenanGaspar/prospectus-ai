ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS prompt_abordagem text,
  ADD COLUMN IF NOT EXISTS prompt_sdr text;