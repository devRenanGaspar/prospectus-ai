-- ============================================================================
-- C1 (enforcement) — Bloquear transição direta para SEND_PENDING / COPY_PENDING
-- ============================================================================
--
--  ⚠️  NÃO APLIQUE ESTA MIGRATION ANTES DE MIGRAR O FRONTEND  ⚠️
--
--  Enquanto os hooks useRequestSend / useRequestCopy ainda fizerem
--  `supabase.from('leads').update({ status: 'SEND_PENDING' | 'COPY_PENDING' })`
--  diretamente, este trigger vai REJEITAR essas escritas e QUEBRAR o envio e a
--  geração de copy para todos os usuários pagantes.
--
--  Ordem de rollout correta:
--    1. Aplicar 20260707120200 (cria request_send / request_copy).  [seguro]
--    2. Trocar o frontend para chamar supabase.rpc('request_send'/'request_copy')
--       em vez de deduct_credits_bulk + insert + update de status.
--    3. Fazer deploy e VERIFICAR que envio e copy funcionam.
--    4. SÓ ENTÃO aplicar esta migration.
--
--  Depois de aplicada, a única forma de um lead entrar em SEND_PENDING/COPY_PENDING
--  é via as RPCs SECURITY DEFINER (que cobram crédito atomicamente). Escrita
--  direta pelo JWT do usuário passa a ser negada — fechando o bypass de crédito
--  do fluxo de ENVIO (que é baseado em polling do get_send_queue_batch).
--
--  Observação: o fluxo de COPY e o de FIND_LEADS também são disparados via
--  webhook-proxy (push). Um usuário ainda pode chamar o webhook-proxy direto e
--  acionar o n8n sem passar pela RPC. Fechar isso 100% exige o webhook-proxy
--  validar entitlement no servidor (ver nota no fim). Este trigger cobre a via
--  de banco; o webhook-proxy é a peça complementar.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_paid_lead_transitions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('SEND_PENDING', 'COPY_PENDING') THEN
    RAISE EXCEPTION 'Permission denied: use request_send()/request_copy() for paid transitions';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_paid_lead_transitions() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS leads_enforce_paid_transitions ON public.leads;
CREATE TRIGGER leads_enforce_paid_transitions
BEFORE UPDATE OF status ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.enforce_paid_lead_transitions();

-- ----------------------------------------------------------------------------
-- Trancar a criação direta de copy_requests / send_requests.
-- Depois do cutover, essas linhas só nascem via request_copy()/request_send()
-- (SECURITY DEFINER), que cobram crédito. Assim, a existência de um
-- copy_request 'processing' vira PROVA de cobrança — o que o webhook-proxy usa
-- para autorizar a geração de copy. (SELECT continua liberado para a UI.)
--
-- ⚠️ Também só aplicar após o frontend parar de inserir essas linhas
--    diretamente (o cutover troca os inserts pelas RPCs).
--
-- lead_searches segue o mesmo modelo: após o cutover, buscas nascem só via
-- request_find_leads (que cobra). O webhook-proxy exige um search
-- 'pending'/'processing' do próprio usuário para autorizar find_leads.
-- ----------------------------------------------------------------------------
REVOKE INSERT ON public.copy_requests FROM authenticated;
REVOKE INSERT ON public.send_requests FROM authenticated;
REVOKE INSERT ON public.lead_searches FROM authenticated;

-- ----------------------------------------------------------------------------
-- Impede o usuário de mexer nos campos que dirigem o reembolso de lead_searches.
-- status/leads_found/refunded_at são geridos pelo sistema (n8n via service_role
-- e a RPC fail_search). Sem isso, o usuário marcava a própria busca como
-- 'failed'/'completed' para forçar estorno indevido.
--
-- ⚠️ Também só aplicar após o cutover: o caminho de falha do webhook precisa já
--    estar usando fail_search() em vez do UPDATE direto de status.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_search_status_tamper()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.leads_found IS DISTINCT FROM OLD.leads_found
       OR NEW.refunded_at IS DISTINCT FROM OLD.refunded_at THEN
      RAISE EXCEPTION 'Permission denied: search status is system-managed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prevent_search_status_tamper() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS lead_searches_prevent_status_tamper ON public.lead_searches;
CREATE TRIGGER lead_searches_prevent_status_tamper
BEFORE UPDATE OF status, leads_found, refunded_at ON public.lead_searches
FOR EACH ROW EXECUTE FUNCTION public.prevent_search_status_tamper();
