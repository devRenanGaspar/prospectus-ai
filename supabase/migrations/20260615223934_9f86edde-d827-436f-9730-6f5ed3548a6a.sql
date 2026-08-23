CREATE TYPE public.business_type AS ENUM ('trafego_pago', 'automacao_ia');

ALTER TABLE public.profiles
  ADD COLUMN business_type public.business_type NOT NULL DEFAULT 'trafego_pago';