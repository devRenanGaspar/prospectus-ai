-- ============================================================================
-- M6 — Observabilidade: onde o sistema falha em silêncio
-- ============================================================================
-- Hoje, se um crédito é debitado e a ação nunca acontece, ou se um request fica
-- preso em 'processing', ou se um lead é enviado duas vezes, nada avisa. Só
-- aparece como reclamação de usuário.
--
-- Estas views são de leitura e só para ADMIN (RLS via security_invoker, então a
-- policy de admin das tabelas base é respeitada).
-- ============================================================================

-- 1) Buscas presas: cobradas, não finalizadas, sem estorno.
--    Sinal de n8n morto no meio ou webhook perdido.
CREATE OR REPLACE VIEW public.ops_stuck_searches
WITH (security_invoker = true) AS
SELECT
  s.id                                             AS search_id,
  s.user_id,
  s.status,
  s.quantity_requested,
  s.leads_found,
  s.created_at,
  now() - s.created_at                             AS idade,
  (SELECT count(*) FROM public.leads l WHERE l.search_id = s.id) AS leads_entregues
FROM public.lead_searches s
WHERE s.status IN ('pending', 'processing')
  AND s.created_at < now() - interval '30 minutes'
  AND s.refunded_at IS NULL;

-- 2) Copy presa: cobrada, o n8n nunca deu callback.
--    Antes do lock expirável isso travava o usuário para sempre.
CREATE OR REPLACE VIEW public.ops_stuck_copy_requests
WITH (security_invoker = true) AS
SELECT
  c.id AS copy_request_id,
  c.user_id,
  c.status,
  array_length(c.lead_ids, 1) AS leads_pedidos,
  c.created_at,
  now() - c.created_at AS idade
FROM public.copy_requests c
WHERE c.status = 'processing'
  AND c.created_at < now() - interval '15 minutes';

-- 3) Reconciliação de crédito: cobrado, o pedido foi referenciado, mas sumiu.
--    Exige `metadata ? 'chave'`: linhas antigas (ou cobradas pelo n8n) não têm
--    a chave e são incorrelacionáveis — não são órfãs, e marcá-las gerava
--    centenas de falso-positivos.
--    Se aparece linha aqui, o usuário pagou e o pedido não existe.
CREATE OR REPLACE VIEW public.ops_orphan_charges
WITH (security_invoker = true) AS
SELECT
  u.id            AS usage_log_id,
  u.user_id,
  u.action_name,
  u.cost,
  u."timestamp"   AS cobrado_em,
  u.metadata
FROM public.usage_logs u
WHERE u.cost > 0
  AND (
    (u.action_name = 'FIND_LEAD' AND u.metadata ? 'search_id' AND NOT EXISTS (
       SELECT 1 FROM public.lead_searches s
        WHERE s.id = (u.metadata ->> 'search_id')::uuid))
 OR (u.action_name = 'GENERATE_COPY' AND u.metadata ? 'copy_request_id' AND NOT EXISTS (
       SELECT 1 FROM public.copy_requests c
        WHERE c.id = (u.metadata ->> 'copy_request_id')::uuid))
 OR (u.action_name = 'SEND_MESSAGE' AND u.metadata ? 'send_request_id' AND NOT EXISTS (
       SELECT 1 FROM public.send_requests r
        WHERE r.id = (u.metadata ->> 'send_request_id')::uuid))
  );

-- 4) Envio duplicado: o mesmo lead cobrado mais de uma vez em SEND_MESSAGE.
--    get_send_queue_batch não tem lock (achado M2), então isto é o detector.
--    ATENÇÃO: usage_logs já tem uma coluna `lead_id`; sem alias explícito no
--    LATERAL ela sombreia o elemento do array e tudo cai num grupo NULL.
CREATE OR REPLACE VIEW public.ops_double_sends
WITH (security_invoker = true) AS
SELECT
  li.value::uuid      AS lead_id,
  count(*)            AS cobrancas,
  min(u."timestamp")  AS primeira,
  max(u."timestamp")  AS ultima
FROM public.usage_logs u
CROSS JOIN LATERAL jsonb_array_elements_text(u.metadata -> 'lead_ids') AS li(value)
WHERE u.action_name = 'SEND_MESSAGE'
  AND jsonb_typeof(u.metadata -> 'lead_ids') = 'array'
GROUP BY li.value
HAVING count(*) > 1;

-- 5) Leads presos num estado PAGO. É o sinal que faltava: o copy_request pode
--    até estar 'completed'/'failed', mas se o lead ficou em COPY_PENDING sem
--    ai_generated_copy, o usuário pagou e não recebeu nada.
--    (Na base restaurada de prod: 564 leads, 19 usuários, ~1.692 créditos.)
CREATE OR REPLACE VIEW public.ops_stuck_leads
WITH (security_invoker = true) AS
SELECT
  l.id          AS lead_id,
  l.user_id,
  l.status,
  l.updated_at,
  now() - l.updated_at AS parado_ha,
  (l.ai_generated_copy IS NULL OR length(trim(l.ai_generated_copy)) = 0) AS sem_copy
FROM public.leads l
WHERE l.status IN ('COPY_PENDING', 'SEND_PENDING')
  AND l.updated_at < now() - interval '1 hour';

-- Nenhuma view é exposta a anon.
REVOKE ALL ON public.ops_stuck_searches      FROM anon;
REVOKE ALL ON public.ops_stuck_copy_requests FROM anon;
REVOKE ALL ON public.ops_orphan_charges      FROM anon;
REVOKE ALL ON public.ops_double_sends        FROM anon;
REVOKE ALL ON public.ops_stuck_leads         FROM anon;
