
-- 1. Atualizar single para aceitar _search_id
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

-- 2. Bulk
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
BEGIN
  IF _lead_ids IS NULL OR array_length(_lead_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'search_id', _search_id,
      'assigned_count', 0,
      'skipped_count', 0,
      'results', '[]'::jsonb
    );
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

  -- Atualizar contador da busca (se informada)
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
