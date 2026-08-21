-- 1. Limpar duplicatas existentes (mantém a mais antiga por user+place)
DELETE FROM public.leads l
USING public.leads o
WHERE l.user_id = o.user_id
  AND l.google_place_id = o.google_place_id
  AND l.user_id IS NOT NULL
  AND l.google_place_id IS NOT NULL
  AND l.created_at > o.created_at;

-- 2. Índice único parcial
CREATE UNIQUE INDEX IF NOT EXISTS leads_user_place_unique
  ON public.leads (user_id, google_place_id)
  WHERE user_id IS NOT NULL AND google_place_id IS NOT NULL;

-- 3. RPC para atribuição segura
CREATE OR REPLACE FUNCTION public.assign_lead_to_user(_lead_id uuid, _user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _place text;
  _current_owner uuid;
BEGIN
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
       SET user_id = _user_id, updated_at = now()
     WHERE id = _lead_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('assigned', false, 'reason', 'DUPLICATE_PLACE');
  END;

  RETURN jsonb_build_object('assigned', true, 'lead_id', _lead_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_lead_to_user(uuid, uuid) TO service_role;
