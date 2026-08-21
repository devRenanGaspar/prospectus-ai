-- ============================================================================
-- Classe de defeito: "o estorno calcula o valor errado"
-- ============================================================================
-- Todo estorno deve devolver o preço EFETIVAMENTE COBRADO multiplicado pela
-- FRAÇÃO NÃO ENTREGUE. As duas implementações existentes tinham exatamente
-- metade do padrão cada uma:
--
--   fail_copy_request .............. fonte do preço correta, estorna integral
--   refund_unused_search_credits ... proporcional, lê o preço ATUAL
--
-- Enumeração da classe: grep por "credits_balance = credits_balance +" nas 93
-- migrations retorna 5 arquivos. Os outros 3 estão fora da classe --
-- admin_add_credits/admin_apply_subscription_credits (crédito comprado, não
-- estorno), prevent_sensitive_profile_update (trigger de proteção) e a
-- migration inerte 20260814190000. fail_search não estorna: marca
-- status='failed' e o trigger chama refund_unused_search_credits, então é
-- corrigido por consequência. A classe tem exatamente 2 membros.
-- ============================================================================


-- ── 1. fail_copy_request: estorno proporcional ──────────────────────────────
--
-- Antes: estornava usage_logs.cost (o total da cobrança) mas só restaurava os
-- leads ainda em COPY_PENDING. Pedir copy de 48 leads (144 créditos), esperar
-- o n8n entregar 40 e chamar esta RPC devolvia 144 E mantinha as 40 copies.
-- Repetível, e chamável por qualquer usuário logado.
--
-- A correção é de ORDEM, não só de fórmula: a versão anterior pagava o estorno
-- antes de calcular _refund_units, então o número certo já existia e era
-- descartado. Agora restaura primeiro, conta, e só então paga.
--
-- A trava de copy_requests continua sendo a primeira instrução: é a outra
-- metade da barreira de clawback com update_copy_request_status, e mover o
-- cálculo não pode alterar a ordem de travas.
CREATE OR REPLACE FUNCTION public.fail_copy_request(_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid          uuid := auth.uid();
  _owner        uuid;
  _status       text;
  _lead_ids     uuid[];
  _refund_units integer;
  _unit_cost    integer;
  _refund_cost  integer;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  SELECT user_id, status, lead_ids INTO _owner, _status, _lead_ids
  FROM public.copy_requests
  WHERE id = _request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'REQUEST_NOT_FOUND');
  END IF;

  IF _owner IS DISTINCT FROM _uid THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  IF _status IS DISTINCT FROM 'processing' THEN
    RETURN jsonb_build_object('success', true, 'skipped', true, 'reason', 'NOT_ACTIVE', 'status', _status);
  END IF;

  -- Preço unitário efetivamente cobrado, gravado por request_copy() no
  -- metadata do usage_logs. Não credit_costs, que pode ter mudado desde então.
  SELECT (metadata->>'unit_cost')::integer INTO _unit_cost
  FROM public.usage_logs
  WHERE action_name = 'GENERATE_COPY'
    AND metadata->>'copy_request_id' = _request_id::text
    AND metadata ? 'unit_cost'
  ORDER BY "timestamp" DESC
  LIMIT 1;

  -- Restaura só os leads que nunca avançaram, e conta ANTES de pagar.
  UPDATE public.leads
  SET status = 'NEW', updated_at = now()
  WHERE id = ANY(_lead_ids)
    AND status = 'COPY_PENDING';
  GET DIAGNOSTICS _refund_units = ROW_COUNT;

  UPDATE public.copy_requests SET status = 'failed' WHERE id = _request_id;

  -- Sem log de cobrança não se fabrica preço: fecha o request sem mover saldo.
  IF _unit_cost IS NULL THEN
    RETURN jsonb_build_object('success', true, 'refunded', 0,
                              'leads_restored', _refund_units,
                              'reason', 'NO_CHARGE_FOUND');
  END IF;

  _refund_cost := _unit_cost * _refund_units;

  IF _refund_cost > 0 THEN
    UPDATE public.profiles
    SET credits_balance = credits_balance + _refund_cost
    WHERE id = _uid;

    INSERT INTO public.usage_logs (user_id, action_name, cost, lead_id, metadata)
    VALUES (
      _uid, 'GENERATE_COPY_REFUND', -_refund_cost, NULL,
      jsonb_build_object('copy_request_id', _request_id, 'reason', 'WEBHOOK_FAILED',
                         'unit_cost', _unit_cost, 'refunded_units', _refund_units)
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'refunded', _refund_cost,
                            'leads_restored', _refund_units);
END;
$$;


-- ── 2. refund_unused_search_credits: preço cobrado, não preço atual ─────────
--
-- Antes: lia credit_costs.FIND_LEAD no momento do estorno, com fallback
-- silencioso ":= 1". Se um admin subisse FIND_LEAD de 1 para 3 entre a
-- cobrança e o estorno, uma busca de 100 devolvia 300 -- crédito emitido do
-- nada. O caminho inverso (queda de preço) lesava o usuário.
--
-- request_find_leads() já grava unit_cost no metadata do usage_logs; passa a
-- ser essa a fonte, igual ao fail_copy_request acima.
CREATE OR REPLACE FUNCTION public.refund_unused_search_credits(_search_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id       uuid;
  _qty           integer;
  _found         integer;
  _status        text;
  _refunded_at   timestamptz;
  _unit_cost     integer;
  _unused        integer;
  _refund_amount integer;
  _reason        text;
BEGIN
  SELECT user_id, quantity_requested, COALESCE(leads_found, 0), status, refunded_at
    INTO _user_id, _qty, _found, _status, _refunded_at
  FROM public.lead_searches
  WHERE id = _search_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'SEARCH_NOT_FOUND');
  END IF;

  IF _refunded_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'skipped', true, 'reason', 'ALREADY_REFUNDED');
  END IF;

  IF _status NOT IN ('completed', 'failed') THEN
    RETURN jsonb_build_object('success', true, 'skipped', true, 'reason', 'STATUS_NOT_FINAL');
  END IF;

  SELECT (metadata->>'unit_cost')::integer INTO _unit_cost
  FROM public.usage_logs
  WHERE action_name = 'FIND_LEAD'
    AND metadata->>'search_id' = _search_id::text
    AND metadata ? 'unit_cost'
  ORDER BY "timestamp" DESC
  LIMIT 1;

  -- Marca como estornada mesmo sem log, para não reprocessar a cada
  -- finalização. Buscas sem log são todas históricas e já finalizadas
  -- (verificado: zero buscas não-finalizadas sem log de cobrança).
  IF _unit_cost IS NULL THEN
    UPDATE public.lead_searches SET refunded_at = now() WHERE id = _search_id;
    RETURN jsonb_build_object('success', true, 'refunded', 0, 'reason', 'NO_CHARGE_FOUND');
  END IF;

  IF _status = 'failed' THEN
    _unused := _qty;
    _reason := 'SEARCH_FAILED';
  ELSE
    _unused := GREATEST(_qty - _found, 0);
    _reason := 'PARTIAL_DELIVERY';
  END IF;

  _refund_amount := _unused * _unit_cost;

  IF _refund_amount > 0 THEN
    UPDATE public.profiles
       SET credits_balance = credits_balance + _refund_amount
     WHERE id = _user_id;

    INSERT INTO public.usage_logs (user_id, action_name, cost, lead_id, metadata)
    VALUES (
      _user_id, 'FIND_LEAD_REFUND', -_refund_amount, NULL,
      jsonb_build_object(
        'search_id', _search_id, 'quantity_requested', _qty, 'leads_found', _found,
        'unit_cost', _unit_cost, 'refunded_units', _unused, 'reason', _reason
      )
    );
  END IF;

  UPDATE public.lead_searches SET refunded_at = now() WHERE id = _search_id;

  RETURN jsonb_build_object('success', true, 'refunded', _refund_amount,
                            'unused_units', _unused, 'reason', _reason);
END;
$$;


-- ── 3. Fechar o lado da ENTREGA ─────────────────────────────────────────────
--
-- Corrigir o cálculo não fecha a classe sozinho. Depois do estorno os leads
-- voltam a NEW, e a entrega do n8n acontece pelas ações genéricas
-- update_lead / update_lead_status do n8n-proxy, que não conhecem
-- copy_request_id. Sem esta trava o usuário ainda recebe copy grátis para os
-- leads pelos quais acabou de ser estornado -- menor que o buraco original,
-- mas não zero.
--
-- A alternativa seria uma RPC de entrega recebendo copy_request_id, o que
-- exigiria o workflow n8n passar a mandá-lo: mudança de contrato fora deste
-- repositório, a mesma dependência externa que 20260817162000 registrou como
-- adiada. Este trigger obtém a mesma serialização usando só o banco.
--
-- Dispara APENAS para escrita de service_role/postgres (o n8n). O usuário
-- final pode arrastar um card para "Copy Pronta" no Kanban -- COPY_READY é uma
-- coluna do board e enforce_paid_lead_transitions só barra SEND_PENDING e
-- COPY_PENDING. Bloquear isso seria regressão de uma ação legítima e gratuita.
-- Deliberadamente NÃO é SECURITY DEFINER: dentro de uma função SECURITY
-- DEFINER, current_user é o DONO (postgres), não quem chamou -- o guard de
-- role nunca reconheceria o usuário final e bloquearia o arrasto no Kanban.
-- É o mesmo motivo pelo qual prevent_sensitive_profile_update (20260707120000)
-- também não é. Sem DEFINER, o SELECT em copy_requests roda como o chamador,
-- o que só acontece para service_role/postgres -- o caminho do usuário retorna
-- antes de qualquer leitura.
CREATE OR REPLACE FUNCTION public.prevent_copy_delivery_after_refund()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _req_status text;
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'COPY_READY' AND OLD.status IS DISTINCT FROM 'COPY_READY' THEN
    SELECT c.status INTO _req_status
    FROM public.copy_requests c
    WHERE NEW.id = ANY(c.lead_ids)
    ORDER BY c.created_at DESC, c.id DESC
    LIMIT 1;

    IF _req_status = 'failed' THEN
      RAISE EXCEPTION 'COPY_REQUEST_ALREADY_REFUNDED';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prevent_copy_delivery_after_refund() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS leads_prevent_copy_after_refund ON public.leads;
CREATE TRIGGER leads_prevent_copy_after_refund
BEFORE UPDATE OF status ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.prevent_copy_delivery_after_refund();
