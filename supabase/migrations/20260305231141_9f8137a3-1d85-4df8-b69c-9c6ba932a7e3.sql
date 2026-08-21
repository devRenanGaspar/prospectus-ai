
-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create handle_new_user function for auto-creating profiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, credits_balance)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'USER',
    100
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  role text NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'ADMIN')),
  plan_id uuid,
  credits_balance integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = _user_id AND role = 'ADMIN'
  );
$$;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Allow insert for trigger" ON public.profiles FOR INSERT WITH CHECK (true);

-- Trigger to create profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Plans
CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  price_monthly numeric(10,2) NOT NULL,
  credits_included integer NOT NULL,
  features jsonb DEFAULT '[]'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read plans" ON public.plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage plans" ON public.plans FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- Add FK from profiles to plans
ALTER TABLE public.profiles ADD CONSTRAINT profiles_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id);

-- Credit costs
CREATE TABLE public.credit_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_name text NOT NULL UNIQUE,
  cost integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.credit_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read costs" ON public.credit_costs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage costs" ON public.credit_costs FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- Agencies
CREATE TABLE public.agencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  context_persona text,
  context_icp jsonb DEFAULT '{}'::jsonb,
  context_qualification jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own agencies" ON public.agencies FOR ALL TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins access all agencies" ON public.agencies FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE TRIGGER update_agencies_updated_at BEFORE UPDATE ON public.agencies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Leads
CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  name text NOT NULL,
  company_name text,
  contact_info jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'NEW',
  source text,
  ai_generated_copy text,
  assigned_user_id uuid REFERENCES public.profiles(id),
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own leads" ON public.leads FOR ALL TO authenticated
  USING (agency_id IN (SELECT id FROM public.agencies WHERE user_id = auth.uid()));
CREATE POLICY "Admins access all leads" ON public.leads FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_leads_status ON public.leads(status);
CREATE INDEX idx_leads_agency_id ON public.leads(agency_id);

-- Messages
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  sender text NOT NULL CHECK (sender IN ('AI', 'USER', 'LEAD', 'SYSTEM')),
  content text NOT NULL,
  external_message_id text,
  timestamp timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own messages" ON public.messages FOR ALL TO authenticated
  USING (lead_id IN (
    SELECT l.id FROM public.leads l JOIN public.agencies a ON l.agency_id = a.id WHERE a.user_id = auth.uid()
  ));
CREATE POLICY "Admins access all messages" ON public.messages FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE INDEX idx_messages_lead_timestamp ON public.messages(lead_id, timestamp DESC);

-- Usage logs
CREATE TABLE public.usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  action_name text NOT NULL,
  cost integer NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  timestamp timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own usage" ON public.usage_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own usage" ON public.usage_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins access all usage" ON public.usage_logs FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE INDEX idx_usage_logs_user_timestamp ON public.usage_logs(user_id, timestamp DESC);

-- N8N webhooks
CREATE TABLE public.n8n_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  url text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.n8n_webhooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own webhooks" ON public.n8n_webhooks FOR ALL TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins access all webhooks" ON public.n8n_webhooks FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- Subscriptions
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.plans(id),
  status text NOT NULL,
  provider text DEFAULT 'stripe',
  provider_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own subscriptions" ON public.subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins access all subscriptions" ON public.subscriptions FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
