ALTER TABLE public.profiles ADD COLUMN owner_name text;
ALTER TABLE public.profiles ADD COLUMN sdr_name text DEFAULT 'MarIA';