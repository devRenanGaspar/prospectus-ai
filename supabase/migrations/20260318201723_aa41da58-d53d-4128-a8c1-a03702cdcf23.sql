
-- Add email column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

-- Backfill emails from auth.users
UPDATE public.profiles
SET email = u.email
FROM auth.users u
WHERE profiles.id = u.id AND profiles.email IS NULL;

-- Update trigger to include email
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, credits_balance, agency_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'USER',
    100,
    '',
    NEW.email
  );
  RETURN NEW;
END;
$function$;
