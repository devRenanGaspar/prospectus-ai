
CREATE TABLE public.subscription_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subscription_id uuid,
  plan_id uuid,
  event_type text NOT NULL DEFAULT 'renewal',
  status text NOT NULL DEFAULT 'pending',
  credits_requested integer,
  credits_applied integer,
  credits_capped integer,
  balance_before integer,
  balance_after integer,
  cap_limit integer,
  period_start timestamptz,
  period_end timestamptz,
  idempotency_key text NOT NULL UNIQUE,
  source text NOT NULL DEFAULT 'n8n',
  raw_payload jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.subscription_events TO authenticated;
GRANT ALL ON public.subscription_events TO service_role;

ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view subscription events"
  ON public.subscription_events
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE INDEX idx_subscription_events_user_created
  ON public.subscription_events (user_id, created_at DESC);

CREATE INDEX idx_subscription_events_subscription
  ON public.subscription_events (subscription_id);

CREATE TRIGGER update_subscription_events_updated_at
  BEFORE UPDATE ON public.subscription_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
