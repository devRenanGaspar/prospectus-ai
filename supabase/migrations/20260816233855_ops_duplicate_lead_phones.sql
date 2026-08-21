-- ============================================================================
-- Duplicate phone numbers within a tenant.
--
-- The SDR agent resolves an inbound WhatsApp message to a lead by querying
-- leads on (user_id, phone) with limit 1. When more than one lead shares a
-- phone inside the same tenant, that lookup silently picks one of them and the
-- conversation, its status transitions and its message history attach to that
-- record while the others go stale.
--
-- Measured on 2026-08-16: 63 duplicated phones, 163 leads, 24 tenants, worst
-- case 12 records on one number. This is not theoretical.
--
-- The lookup itself was made deterministic in the same change (n8n-proxy
-- query_leads now orders by created_at, id) so the winner is at least stable.
-- This view exists to surface the underlying data problem, which ordering
-- hides rather than fixes.
--
-- Same shape as the other ops_* views: read-only, security_invoker so RLS
-- applies, revoked from anon.
-- ============================================================================

CREATE OR REPLACE VIEW public.ops_duplicate_lead_phones
WITH (security_invoker = true) AS
SELECT
  l.user_id,
  l.phone,
  count(*)                                   AS leads_no_mesmo_telefone,
  min(l.created_at)                          AS primeiro_criado_em,
  max(l.created_at)                          AS ultimo_criado_em,
  -- The record the agent will now resolve to, given the deterministic order.
  (array_agg(l.id ORDER BY l.created_at, l.id))[1] AS lead_vencedor,
  array_agg(DISTINCT l.status)               AS status_envolvidos,
  count(*) FILTER (WHERE l.ai_agent_enabled) AS com_agente_ligado
FROM public.leads l
WHERE l.phone IS NOT NULL
  AND l.phone <> ''
GROUP BY l.user_id, l.phone
HAVING count(*) > 1;

COMMENT ON VIEW public.ops_duplicate_lead_phones IS
  'Telefones repetidos dentro do mesmo tenant. O agente SDR resolve a mensagem recebida por (user_id, phone) com limit 1, entao duplicata faz a conversa grudar em um registro so e os outros ficarem obsoletos.';

REVOKE ALL ON public.ops_duplicate_lead_phones FROM anon;
