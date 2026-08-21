ALTER TABLE public.profiles ADD COLUMN sdr_phone text DEFAULT NULL;
ALTER TABLE public.profiles ADD COLUMN sdr_availability jsonb DEFAULT NULL;