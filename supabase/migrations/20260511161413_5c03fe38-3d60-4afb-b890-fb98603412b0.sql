ALTER TABLE public.lead_comments DROP CONSTRAINT lead_comments_lead_id_fkey;

CREATE OR REPLACE FUNCTION public.cleanup_lead_comments_on_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.lead_comments WHERE lead_id = OLD.id;
  RETURN OLD;
END;
$$;

CREATE TRIGGER cleanup_comments_after_lead_delete
  AFTER DELETE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_lead_comments_on_delete();

CREATE TRIGGER cleanup_comments_after_lead_reserve_delete
  AFTER DELETE ON public.leads_reserve
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_lead_comments_on_delete();