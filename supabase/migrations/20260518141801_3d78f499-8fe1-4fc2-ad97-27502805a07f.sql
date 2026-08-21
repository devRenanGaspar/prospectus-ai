
CREATE TABLE public.whatsapp_connection_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('connected','disconnected','pending','number_changed')),
  phone text,
  previous_phone text,
  previous_status text,
  new_status text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wa_events_user_created ON public.whatsapp_connection_events(user_id, created_at DESC);

ALTER TABLE public.whatsapp_connection_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own wa events"
ON public.whatsapp_connection_events FOR SELECT
TO authenticated
USING (auth.uid() = user_id AND public.is_active_user(auth.uid()));

CREATE POLICY "Admins read all wa events"
ON public.whatsapp_connection_events FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.log_whatsapp_state_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  status_changed boolean := NEW.whatsapp_status IS DISTINCT FROM OLD.whatsapp_status;
  number_changed boolean := NEW.whatsapp_number IS DISTINCT FROM OLD.whatsapp_number;
BEGIN
  IF NOT status_changed AND NOT number_changed THEN
    RETURN NEW;
  END IF;

  IF status_changed THEN
    IF NEW.whatsapp_status = 'active' THEN
      INSERT INTO public.whatsapp_connection_events
        (user_id, event_type, phone, previous_status, new_status)
      VALUES (NEW.id, 'connected', NEW.whatsapp_number, OLD.whatsapp_status, NEW.whatsapp_status);
    ELSIF NEW.whatsapp_status = 'disconnected' THEN
      INSERT INTO public.whatsapp_connection_events
        (user_id, event_type, phone, previous_status, new_status)
      VALUES (NEW.id, 'disconnected', COALESCE(OLD.whatsapp_number, NEW.whatsapp_number_last), OLD.whatsapp_status, NEW.whatsapp_status);
    ELSIF NEW.whatsapp_status = 'pending' THEN
      INSERT INTO public.whatsapp_connection_events
        (user_id, event_type, phone, previous_status, new_status)
      VALUES (NEW.id, 'pending', NEW.whatsapp_number, OLD.whatsapp_status, NEW.whatsapp_status);
    END IF;
  END IF;

  IF number_changed AND NOT status_changed
     AND OLD.whatsapp_number IS NOT NULL AND NEW.whatsapp_number IS NOT NULL THEN
    INSERT INTO public.whatsapp_connection_events
      (user_id, event_type, phone, previous_phone, previous_status, new_status)
    VALUES (NEW.id, 'number_changed', NEW.whatsapp_number, OLD.whatsapp_number, OLD.whatsapp_status, NEW.whatsapp_status);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_whatsapp_state_change
AFTER UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.log_whatsapp_state_change();

-- Backfill: estado atual como baseline
INSERT INTO public.whatsapp_connection_events (user_id, event_type, phone, new_status, metadata)
SELECT id,
       CASE WHEN whatsapp_status = 'active' THEN 'connected'
            WHEN whatsapp_status = 'pending' THEN 'pending'
            ELSE 'disconnected' END,
       COALESCE(whatsapp_number, whatsapp_number_last),
       whatsapp_status,
       jsonb_build_object('source','backfill')
FROM public.profiles
WHERE whatsapp_status IS NOT NULL;
