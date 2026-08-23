-- ============================================================================
-- C1 / A3 — RPCs atômicas de débito + transição de status
-- ============================================================================
-- Substituem o padrão frágil do cliente ("debita crédito" e, em chamadas
-- separadas e não-atômicas, "muda o status do lead"), que permitia:
--   - perda de créditos em falha parcial / aba fechada (sem estorno);
--   - cobrança dupla em clique duplo;
--   - e, junto com a RLS de escrita direta em leads, BURLAR o crédito
--     mandando o lead para SEND_PENDING/COPY_PENDING sem debitar.
--
-- Cada função roda como SECURITY DEFINER (dono = postgres), então:
--   - é uma única transação (débito + status + logs, tudo ou nada);
--   - é idempotente por _request_id;
--   - só cobra pelos leads do próprio usuário efetivamente transicionados.
--
-- ADITIVO E SEGURO PARA APLICAR JÁ: nada quebra ao criar estas funções. O
-- bloqueio da via antiga (escrita direta de status) está numa migration
-- SEPARADA (20260707120300) que só deve ser aplicada DEPOIS que o frontend
-- passar a chamar estas RPCs.
-- ============================================================================


-- ── request_send: enfileira leads para envio (status SEND_PENDING) ──────────
CREATE OR REPLACE FUNCTION public.request_send(_lead_ids uuid[], _request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid        uuid := auth.uid();
  _unit_cost  integer;
  _eligible   uuid[];
  _n          integer;
  _total      integer;
  _balance    integer;
  _new_balance integer;
  _inserted   integer;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;
  IF NOT public.is_active_user(_uid) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;
  IF _request_id IS NULL THEN
    RAISE EXCEPTION 'REQUEST_ID_REQUIRED';
  END IF;
  IF _lead_ids IS NULL OR array_length(_lead_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'LEAD_IDS_REQUIRED';
  END IF;

  -- Idempotência: reivindica o slot deste request_id.
  INSERT INTO public.send_requests (id, user_id, lead_ids, status)
  VALUES (_request_id, _uid, _lead_ids, 'processing')
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS _inserted = ROW_COUNT;
  IF _inserted = 0 THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true, 'skipped', true, 'request_id', _request_id);
  END IF;

  -- Leads elegíveis: do próprio usuário e que ainda não estão na fila.
  -- FOR UPDATE evita corrida com outra chamada concorrente.
  SELECT array_agg(id) INTO _eligible
  FROM (
    SELECT id FROM public.leads
    WHERE id = ANY(_lead_ids)
      AND user_id = _uid
      AND status IS DISTINCT FROM 'SEND_PENDING'
    FOR UPDATE
  ) s;

  _n := COALESCE(array_length(_eligible, 1), 0);
  IF _n = 0 THEN
    UPDATE public.send_requests SET status = 'completed' WHERE id = _request_id;
    RETURN jsonb_build_object('success', true, 'charged', 0, 'cost', 0, 'request_id', _request_id);
  END IF;

  SELECT cost INTO _unit_cost FROM public.credit_costs WHERE action_name = 'SEND_MESSAGE';
  IF _unit_cost IS NULL THEN
    RAISE EXCEPTION 'ACTION_NOT_FOUND';
  END IF;
  _total := _unit_cost * _n;

  SELECT credits_balance INTO _balance FROM public.profiles WHERE id = _uid FOR UPDATE;
  IF _balance IS NULL THEN
    RAISE EXCEPTION 'USER_NOT_FOUND';
  END IF;
  IF _balance < _total THEN
    -- Rollback de tudo (inclusive o slot de idempotência) => cliente pode
    -- comprar créditos e tentar de novo com um novo request_id.
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS';
  END IF;

  _new_balance := _balance - _total;
  UPDATE public.profiles SET credits_balance = _new_balance WHERE id = _uid;

  UPDATE public.leads
     SET status = 'SEND_PENDING', updated_at = now()
   WHERE id = ANY(_eligible);

  INSERT INTO public.usage_logs (user_id, action_name, cost, lead_id, metadata)
  VALUES (_uid, 'SEND_MESSAGE', _total, NULL,
          jsonb_build_object('send_request_id', _request_id, 'lead_ids', _eligible,
                             'quantity', _n, 'unit_cost', _unit_cost, 'queue', true));

  UPDATE public.send_requests SET status = 'completed', lead_ids = _eligible WHERE id = _request_id;

  RETURN jsonb_build_object('success', true, 'charged', _n, 'cost', _total,
                            'new_balance', _new_balance, 'request_id', _request_id,
                            'lead_ids', _eligible);
END;
$$;


-- ── request_copy: solicita geração de copy (status COPY_PENDING) ─────────────
CREATE OR REPLACE FUNCTION public.request_copy(_lead_ids uuid[], _request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid        uuid := auth.uid();
  _unit_cost  integer;
  _eligible   uuid[];
  _n          integer;
  _total      integer;
  _balance    integer;
  _new_balance integer;
  _inserted   integer;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;
  IF NOT public.is_active_user(_uid) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;
  IF _request_id IS NULL THEN
    RAISE EXCEPTION 'REQUEST_ID_REQUIRED';
  END IF;
  IF _lead_ids IS NULL OR array_length(_lead_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'LEAD_IDS_REQUIRED';
  END IF;

  -- Lock de "copy em andamento" que EXPIRA (corrige o lock permanente): só
  -- bloqueia se houver uma solicitação 'processing' recente (< 15 min). Se o
  -- n8n travou e nunca deu callback, o lock some sozinho.
  IF EXISTS (
    SELECT 1 FROM public.copy_requests
    WHERE user_id = _uid
      AND status = 'processing'
      AND id <> _request_id
      AND created_at > now() - interval '15 minutes'
  ) THEN
    RAISE EXCEPTION 'COPY_IN_PROGRESS';
  END IF;

  INSERT INTO public.copy_requests (id, user_id, lead_ids, status)
  VALUES (_request_id, _uid, _lead_ids, 'processing')
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS _inserted = ROW_COUNT;
  IF _inserted = 0 THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true, 'skipped', true, 'request_id', _request_id);
  END IF;

  SELECT array_agg(id) INTO _eligible
  FROM (
    SELECT id FROM public.leads
    WHERE id = ANY(_lead_ids)
      AND user_id = _uid
      AND status IS DISTINCT FROM 'COPY_PENDING'
    FOR UPDATE
  ) s;

  _n := COALESCE(array_length(_eligible, 1), 0);
  IF _n = 0 THEN
    -- Nada a fazer: fecha o registro para não virar lock fantasma.
    UPDATE public.copy_requests SET status = 'completed' WHERE id = _request_id;
    RETURN jsonb_build_object('success', true, 'charged', 0, 'cost', 0, 'request_id', _request_id);
  END IF;

  SELECT cost INTO _unit_cost FROM public.credit_costs WHERE action_name = 'GENERATE_COPY';
  IF _unit_cost IS NULL THEN
    RAISE EXCEPTION 'ACTION_NOT_FOUND';
  END IF;
  _total := _unit_cost * _n;

  SELECT credits_balance INTO _balance FROM public.profiles WHERE id = _uid FOR UPDATE;
  IF _balance IS NULL THEN
    RAISE EXCEPTION 'USER_NOT_FOUND';
  END IF;
  IF _balance < _total THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS';
  END IF;

  _new_balance := _balance - _total;
  UPDATE public.profiles SET credits_balance = _new_balance WHERE id = _uid;

  UPDATE public.leads
     SET status = 'COPY_PENDING', updated_at = now()
   WHERE id = ANY(_eligible);

  INSERT INTO public.usage_logs (user_id, action_name, cost, lead_id, metadata)
  VALUES (_uid, 'GENERATE_COPY', _total, NULL,
          jsonb_build_object('copy_request_id', _request_id, 'lead_ids', _eligible,
                             'quantity', _n, 'unit_cost', _unit_cost));

  -- Mantém copy_requests em 'processing': o n8n finaliza via n8n-proxy.
  UPDATE public.copy_requests SET lead_ids = _eligible WHERE id = _request_id;

  RETURN jsonb_build_object('success', true, 'charged', _n, 'cost', _total,
                            'new_balance', _new_balance, 'request_id', _request_id,
                            'lead_ids', _eligible);
END;
$$;


-- Só o usuário autenticado chama (a função checa auth.uid() por dentro).
REVOKE ALL ON FUNCTION public.request_send(uuid[], uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.request_copy(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_send(uuid[], uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_copy(uuid[], uuid) TO authenticated;
