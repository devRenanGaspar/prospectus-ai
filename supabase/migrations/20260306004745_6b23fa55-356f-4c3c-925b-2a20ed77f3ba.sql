
-- Create webhook_configs table (admin-managed, global)
CREATE TABLE public.webhook_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  url text NOT NULL,
  timeout_seconds integer NOT NULL DEFAULT 30,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(type)
);

ALTER TABLE public.webhook_configs ENABLE ROW LEVEL SECURITY;

-- Admin-only write
CREATE POLICY "Admins can manage webhook_configs"
  ON public.webhook_configs FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- Authenticated read for active webhooks
CREATE POLICY "Authenticated users can read active webhooks"
  ON public.webhook_configs FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Add WhatsApp columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN whatsapp_status text NOT NULL DEFAULT 'disconnected',
  ADD COLUMN whatsapp_number text,
  ADD COLUMN whatsapp_photo text;
