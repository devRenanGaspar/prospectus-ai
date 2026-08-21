-- ============================================================================
-- Fecha a micro-corrida entre fail_search() e a entrega de leads pelo n8n
-- ============================================================================
-- Situação (resíduo deixado pela 20260707120500):
--
-- O frontend chama fail_search() quando a invocação do webhook falha. Mas
-- `functions.invoke` falha também por TIMEOUT — e nesse caso o n8n pode ter
-- recebido a requisição e estar rodando. Sequência do abuso:
--
--   t0  usuário dispara request_find_leads()  -> cobra N créditos, busca 'pending'
--   t1  n8n recebe, começa a buscar (ainda não inseriu nada)
--   t2  o invoke estoura timeout no cliente -> fail_search()
--       -> zero leads entregues, passa na checagem -> status 'failed'
--       -> trg_refund_on_search_finalized estorna os N créditos
--   t3  n8n termina e chama assign_leads_to_user(..., _search_id)
--       -> os leads são entregues assim mesmo
--
-- Resultado: leads entregues + créditos estornados. O usuário não precisa nem
-- forçar o timeout; basta fechar a aba na hora certa.
--
-- A checagem "zero leads entregues" do fail_search não resolve porque ela olha
-- um estado que ainda vai mudar. Faltava o outro lado da barreira: quem entrega
-- os leads precisa recusar entregar numa busca já estornada.
--
-- Correção, em duas partes:
--
--   1. assign_lead_to_user / assign_leads_to_user passam a travar a linha de
--      lead_searches ANTES de mexer nos leads (`SELECT ... FOR UPDATE`) e a
--      recusar se a busca já foi finalizada como 'failed' ou já tem
--      refunded_at preenchido.
--
--   2. Como fail_search() trava exatamente a mesma linha antes de contar os
--      leads, as duas transações passam a serializar nela. Não há ordem de
--      lock cruzada (ambas pegam lead_searches primeiro, leads depois), então
--      não há deadlock. Quem chegar primeiro vence:
--
--        - assign primeiro: fail_search espera o lock, e ao reler já enxerga
--          os leads commitados -> HAS_DELIVERED_LEADS, sem estorno.
--        - fail_search primeiro: assign espera o lock, e ao reler já enxerga
--          status='failed'/refunded_at -> SEARCH_ALREADY_REFUNDED, sem entrega.
--
-- Contrato com o n8n: o formato da resposta não muda (mesmas chaves), só ganha
-- uma chave `error` no caso recusado, com assigned_count = 0. Um workflow que
-- já trata assigned_count = 0 continua funcionando sem alteração.
--
-- Não muda o conjunto de status aceitos pelo fail_search ('pending' e
-- 'processing'). Restringir só a 'pending' exigiria o n8n marcar 'processing'
-- no início da execução; com esta migration isso deixa de ser necessário.
--
-- ADITIVO. Só substitui o corpo de duas funções que já são service_role-only.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.assign_lead_to_user(
  _lead_id uuid,
  _user_id uuid,
  _search_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _place text;
  _current_owner uuid;
  _s_status text;
  _s_refunded timestamptz;
BEGIN
  -- Trava a busca antes de qualquer coisa: serializa contra fail_search().
  IF _search_id IS NOT NULL THEN
    SELECT status, refunded_at INTO _s_status, _s_refunded
    FROM public.lead_searches WHERE id = _search_id FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('assigned', false, 'reason', 'SEARCH_NOT_FOUND');
    END IF;

    IF _s_refunded IS NOT NULL OR _s_status = 'failed' THEN
      RETURN jsonb_build_object('assigned', false, 'reason', 'SEARCH_ALREADY_REFUNDED');
    END IF;
  END IF;

  SELECT google_place_id, user_id INTO _place, _current_owner
  FROM public.leads WHERE id = _lead_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('assigned', false, 'reason', 'LEAD_NOT_FOUND');
  END IF;

  IF _current_owner IS NOT NULL THEN
    RETURN jsonb_build_object('assigned', false, 'reason', 'ALREADY_OWNED');
  END IF;

  IF _place IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.leads
    WHERE user_id = _user_id AND google_place_id = _place
  ) THEN
    RETURN jsonb_build_object('assigned', false, 'reason', 'DUPLICATE_PLACE');
  END IF;

  BEGIN
    UPDATE public.leads
       SET user_id = _user_id,
           search_id = COALESCE(_search_id, search_id),
           updated_at = now()
     WHERE id = _lead_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('assigned', false, 'reason', 'DUPLICATE_PLACE');
  END;

  RETURN jsonb_build_object('assigned', true, 'lead_id', _lead_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assign_lead_to_user(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_lead_to_user(uuid, uuid, uuid) TO service_role;


CREATE OR REPLACE FUNCTION public.assign_leads_to_user(
  _user_id uuid,
  _lead_ids uuid[],
  _search_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _lead_id uuid;
  _place text;
  _current_owner uuid;
  _results jsonb := '[]'::jsonb;
  _assigned int := 0;
  _skipped int := 0;
  _reason text;
  _ok boolean;
  _s_status text;
  _s_refunded timestamptz;
BEGIN
  IF _lead_ids IS NULL OR array_length(_lead_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'search_id', _search_id,
      'assigned_count', 0,
      'skipped_count', 0,
      'results', '[]'::jsonb
    );
  END IF;

  -- Trava a busca antes de qualquer coisa: serializa contra fail_search().
  IF _search_id IS NOT NULL THEN
    SELECT status, refunded_at INTO _s_status, _s_refunded
    FROM public.lead_searches WHERE id = _search_id FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'search_id', _search_id,
        'assigned_count', 0,
        'skipped_count', array_length(_lead_ids, 1),
        'error', 'SEARCH_NOT_FOUND',
        'results', '[]'::jsonb
      );
    END IF;

    -- Busca já estornada: entregar os leads agora seria dar leads de graça.
    IF _s_refunded IS NOT NULL OR _s_status = 'failed' THEN
      RETURN jsonb_build_object(
        'search_id', _search_id,
        'assigned_count', 0,
        'skipped_count', array_length(_lead_ids, 1),
        'error', 'SEARCH_ALREADY_REFUNDED',
        'results', '[]'::jsonb
      );
    END IF;
  END IF;

  FOREACH _lead_id IN ARRAY _lead_ids LOOP
    _ok := false;
    _reason := NULL;

    SELECT google_place_id, user_id INTO _place, _current_owner
    FROM public.leads WHERE id = _lead_id FOR UPDATE;

    IF NOT FOUND THEN
      _reason := 'LEAD_NOT_FOUND';
    ELSIF _current_owner IS NOT NULL THEN
      _reason := 'ALREADY_OWNED';
    ELSIF _place IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.leads
      WHERE user_id = _user_id AND google_place_id = _place
    ) THEN
      _reason := 'DUPLICATE_PLACE';
    ELSE
      BEGIN
        UPDATE public.leads
           SET user_id = _user_id,
               search_id = COALESCE(_search_id, search_id),
               updated_at = now()
         WHERE id = _lead_id;
        _ok := true;
      EXCEPTION WHEN unique_violation THEN
        _reason := 'DUPLICATE_PLACE';
      END;
    END IF;

    IF _ok THEN
      _assigned := _assigned + 1;
      _results := _results || jsonb_build_object('lead_id', _lead_id, 'assigned', true);
    ELSE
      _skipped := _skipped + 1;
      _results := _results || jsonb_build_object('lead_id', _lead_id, 'assigned', false, 'reason', _reason);
    END IF;
  END LOOP;

  IF _search_id IS NOT NULL THEN
    UPDATE public.lead_searches
       SET leads_found = (
         SELECT count(*) FROM public.leads
         WHERE search_id = _search_id AND user_id = _user_id
       )
     WHERE id = _search_id;
  END IF;

  RETURN jsonb_build_object(
    'search_id', _search_id,
    'assigned_count', _assigned,
    'skipped_count', _skipped,
    'results', _results
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assign_leads_to_user(uuid, uuid[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_leads_to_user(uuid, uuid[], uuid) TO service_role;
