-- Create leads_reserve table mirroring leads structure
CREATE TABLE public.leads_reserve (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  company_name text,
  contact_info jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'NEW',
  source text,
  ai_generated_copy text,
  assigned_user_id uuid,
  last_message_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  user_id uuid,
  google_place_id text,
  phone text,
  neighborhood text,
  city text,
  total_score text,
  reviews_count text,
  rank text,
  website text,
  images_count text,
  image_url text,
  category_name text,
  cnpj text,
  instagram text,
  lead_replied text,
  lead_reply_score text,
  mensagem_abordagem_comercial text,
  cnpj_alternativo text,
  instagram_alternativo text,
  whatsapp_do_site text,
  whatsapp_alternativo text,
  search_id uuid,
  ai_agent_enabled boolean NOT NULL DEFAULT true,
  state text,
  country text,
  website_analysis text
);

CREATE INDEX idx_leads_reserve_gpid_user ON public.leads_reserve (google_place_id, user_id);

ALTER TABLE public.leads_reserve ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read all leads_reserve"
ON public.leads_reserve FOR SELECT
TO authenticated
USING (is_admin(auth.uid()));