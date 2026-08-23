
ALTER TABLE public.lead_searches ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE public.copy_requests ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE public.send_requests ADD COLUMN IF NOT EXISTS completed_at timestamptz;

CREATE OR REPLACE FUNCTION public.set_completed_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('completed', 'failed')
     AND (OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.completed_at IS NULL THEN
    NEW.completed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_completed_at_lead_searches ON public.lead_searches;
CREATE TRIGGER set_completed_at_lead_searches
  BEFORE UPDATE OF status ON public.lead_searches
  FOR EACH ROW EXECUTE FUNCTION public.set_completed_at();

DROP TRIGGER IF EXISTS set_completed_at_copy_requests ON public.copy_requests;
CREATE TRIGGER set_completed_at_copy_requests
  BEFORE UPDATE OF status ON public.copy_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_completed_at();

DROP TRIGGER IF EXISTS set_completed_at_send_requests ON public.send_requests;
CREATE TRIGGER set_completed_at_send_requests
  BEFORE UPDATE OF status ON public.send_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_completed_at();

UPDATE public.lead_searches
   SET completed_at = COALESCE(refunded_at, created_at)
 WHERE completed_at IS NULL AND status IN ('completed', 'failed');

UPDATE public.copy_requests
   SET completed_at = created_at
 WHERE completed_at IS NULL AND status IN ('completed', 'failed');

UPDATE public.send_requests
   SET completed_at = created_at
 WHERE completed_at IS NULL AND status IN ('completed', 'failed');
