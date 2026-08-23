-- ============================================================================
-- C1 (find_leads) — RPC de falha controlada, fecha o clawback de reembolso
-- ============================================================================
-- O caminho de falha do webhook precisava marcar a busca como 'failed' para
-- estornar. Fazer isso com UPDATE direto do cliente abria abuso: o usuário
-- marcava a PRÓPRIA busca como failed e o trigger reembolsava a quantidade
-- cheia, enquanto o n8n ainda entregava os leads (reembolso + leads de graça).
--
-- fail_search só falha uma busca:
--   - do próprio usuário,
--   - ainda ativa ('pending'/'processing'),
--   - que NÃO entregou nenhum lead (count de leads com aquele search_id = 0).
-- Assim, o caso legítimo (n8n inalcançável, 0 leads) estorna; e não dá para
-- "falhar" uma busca que já produziu resultado.
--
-- O UPDATE direto de status/leads_found/refunded_at pelo usuário é trancado na
-- 20260707120300 (aplicar após o cutover do frontend para esta RPC).
--
-- ADITIVO E SEGURO PARA APLICAR JÁ.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fail_search(_search_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid       uuid := auth.uid();
  _owner     uuid;
  _status    text;
  _delivered integer;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  SELECT user_id, status INTO _owner, _status
  FROM public.lead_searches
  WHERE id = _search_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'SEARCH_NOT_FOUND');
  END IF;

  IF _owner IS DISTINCT FROM _uid THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  -- Só falha buscas ainda não finalizadas (idempotente para o resto).
  IF _status NOT IN ('pending', 'processing') THEN
    RETURN jsonb_build_object('success', true, 'skipped', true, 'reason', 'NOT_ACTIVE', 'status', _status);
  END IF;

  -- Não permite falhar uma busca que já entregou leads.
  SELECT count(*) INTO _delivered FROM public.leads WHERE search_id = _search_id;
  IF _delivered > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'HAS_DELIVERED_LEADS', 'delivered', _delivered);
  END IF;

  -- Marca como failed; o trigger trg_refund_on_search_finalized estorna.
  UPDATE public.lead_searches SET status = 'failed' WHERE id = _search_id;

  RETURN jsonb_build_object('success', true, 'failed', true, 'search_id', _search_id);
END;
$$;

REVOKE ALL ON FUNCTION public.fail_search(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fail_search(uuid) TO authenticated;
