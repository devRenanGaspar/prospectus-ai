-- ============================================================================
-- C1 (find_leads) — RPC atômica de débito + criação de busca
-- ============================================================================
-- Mesmo padrão de request_send/request_copy: fecha o bypass em que o usuário
-- criava uma lead_searches direto (RLS permite insert próprio) sem debitar, ou
-- chamava o webhook-proxy 'find_leads' na mão, e o n8n rodava a busca (que tem
-- custo real) de graça.
--
-- ADITIVO E SEGURO PARA APLICAR JÁ. O tranco da via antiga (REVOKE INSERT em
-- lead_searches) está na 20260707120300, que só entra após o cutover do
-- frontend para esta RPC.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.request_find_leads(
  _quantity integer,
  _limit_per_niche integer,
  _request_id uuid,
  _require_website boolean DEFAULT false,
  _require_instagram boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid         uuid := auth.uid();
  _unit_cost   integer;
  _total       integer;
  _balance     integer;
  _new_balance integer;
  _inserted    integer;
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
  IF _quantity IS NULL OR _quantity < 1 THEN
    RAISE EXCEPTION 'INVALID_QUANTITY';
  END IF;

  -- Lock de "busca em andamento" que EXPIRA (corrige o lock permanente do
  -- fluxo antigo): só bloqueia se houver uma busca ativa e recente (< 30 min).
  IF EXISTS (
    SELECT 1 FROM public.lead_searches
    WHERE user_id = _uid
      AND status IN ('pending', 'processing')
      AND id <> _request_id
      AND created_at > now() - interval '30 minutes'
  ) THEN
    RAISE EXCEPTION 'SEARCH_IN_PROGRESS';
  END IF;

  -- Idempotência: reivindica o slot deste request_id.
  INSERT INTO public.lead_searches (id, user_id, quantity_requested, limit_per_niche, status)
  VALUES (_request_id, _uid, _quantity, COALESCE(_limit_per_niche, 0), 'pending')
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS _inserted = ROW_COUNT;
  IF _inserted = 0 THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true, 'skipped', true, 'search_id', _request_id);
  END IF;

  SELECT cost INTO _unit_cost FROM public.credit_costs WHERE action_name = 'FIND_LEAD';
  IF _unit_cost IS NULL THEN
    RAISE EXCEPTION 'ACTION_NOT_FOUND';
  END IF;
  _total := _unit_cost * _quantity;

  SELECT credits_balance INTO _balance FROM public.profiles WHERE id = _uid FOR UPDATE;
  IF _balance IS NULL THEN
    RAISE EXCEPTION 'USER_NOT_FOUND';
  END IF;
  IF _balance < _total THEN
    -- Rollback de tudo (inclusive o slot) => cliente compra créditos e refaz
    -- com um novo request_id.
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS';
  END IF;

  _new_balance := _balance - _total;
  UPDATE public.profiles SET credits_balance = _new_balance WHERE id = _uid;

  INSERT INTO public.usage_logs (user_id, action_name, cost, lead_id, metadata)
  VALUES (_uid, 'FIND_LEAD', _total, NULL,
          jsonb_build_object('search_id', _request_id, 'quantity', _quantity,
                             'limit_per_niche', _limit_per_niche, 'unit_cost', _unit_cost,
                             'require_website', _require_website,
                             'require_instagram', _require_instagram));

  RETURN jsonb_build_object('success', true, 'charged', _quantity, 'cost', _total,
                            'new_balance', _new_balance, 'search_id', _request_id);
END;
$$;

REVOKE ALL ON FUNCTION public.request_find_leads(integer, integer, uuid, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_find_leads(integer, integer, uuid, boolean, boolean) TO authenticated;
