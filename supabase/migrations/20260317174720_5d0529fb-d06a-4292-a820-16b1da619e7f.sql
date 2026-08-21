ALTER TABLE public.lead_comments 
  ALTER COLUMN commented_at DROP DEFAULT,
  ALTER COLUMN commented_at TYPE text USING commented_at::text;