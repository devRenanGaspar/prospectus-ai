-- Performance indexes for common queries
CREATE INDEX IF NOT EXISTS idx_leads_agency_id ON public.leads (agency_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads (status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_agency_status ON public.leads (agency_id, status);
CREATE INDEX IF NOT EXISTS idx_messages_lead_id ON public.messages (lead_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON public.messages (lead_id, timestamp ASC);
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON public.usage_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_timestamp ON public.usage_logs (user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_usage_logs_action ON public.usage_logs (user_id, action_name);
CREATE INDEX IF NOT EXISTS idx_agencies_user_id ON public.agencies (user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions (user_id, status);
CREATE INDEX IF NOT EXISTS idx_n8n_webhooks_user_id ON public.n8n_webhooks (user_id);

-- Add trigger for updated_at on leads
DROP TRIGGER IF EXISTS update_leads_updated_at ON public.leads;
CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add trigger for updated_at on agencies
DROP TRIGGER IF EXISTS update_agencies_updated_at ON public.agencies;
CREATE TRIGGER update_agencies_updated_at BEFORE UPDATE ON public.agencies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();