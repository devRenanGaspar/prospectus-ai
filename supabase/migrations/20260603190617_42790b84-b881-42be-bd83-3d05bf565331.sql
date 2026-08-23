
CREATE OR REPLACE FUNCTION public.promote_reserve_to_pool()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _promoted int := 0;
  _removed int := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  WITH candidates AS (
    SELECT DISTINCT ON (r.google_place_id)
      r.id, r.name, r.company_name, r.contact_info, r.status, r.source,
      r.ai_generated_copy, r.assigned_user_id, r.last_message_at,
      r.created_at, r.updated_at, r.user_id, r.google_place_id, r.phone,
      r.neighborhood, r.city, r.total_score, r.reviews_count, r.rank,
      r.website, r.images_count, r.image_url, r.category_name, r.cnpj,
      r.instagram, r.lead_replied, r.lead_reply_score,
      r.mensagem_abordagem_comercial, r.cnpj_alternativo,
      r.instagram_alternativo, r.whatsapp_do_site, r.whatsapp_alternativo,
      r.search_id, r.ai_agent_enabled, r.state, r.country, r.website_analysis
    FROM public.leads_reserve r
    WHERE r.user_id IS NULL
      AND r.google_place_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.google_place_id = r.google_place_id
          AND l.user_id IS NULL
      )
    ORDER BY r.google_place_id, r.created_at ASC
  ),
  inserted AS (
    INSERT INTO public.leads (
      id, name, company_name, contact_info, status, source,
      ai_generated_copy, assigned_user_id, last_message_at,
      created_at, updated_at, user_id, google_place_id, phone,
      neighborhood, city, total_score, reviews_count, rank,
      website, images_count, image_url, category_name, cnpj,
      instagram, lead_replied, lead_reply_score,
      mensagem_abordagem_comercial, cnpj_alternativo,
      instagram_alternativo, whatsapp_do_site, whatsapp_alternativo,
      search_id, ai_agent_enabled, state, country, website_analysis
    )
    SELECT
      id, name, company_name, contact_info, status, source,
      ai_generated_copy, assigned_user_id, last_message_at,
      created_at, updated_at, user_id, google_place_id, phone,
      neighborhood, city, total_score, reviews_count, rank,
      website, images_count, image_url, category_name, cnpj,
      instagram, lead_replied, lead_reply_score,
      mensagem_abordagem_comercial, cnpj_alternativo,
      instagram_alternativo, whatsapp_do_site, whatsapp_alternativo,
      search_id, ai_agent_enabled, state, country, website_analysis
    FROM candidates
    RETURNING 1
  )
  SELECT count(*) INTO _promoted FROM inserted;

  WITH deleted AS (
    DELETE FROM public.leads_reserve r
    WHERE r.user_id IS NULL
      AND r.google_place_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.google_place_id = r.google_place_id
          AND l.user_id IS NULL
      )
    RETURNING 1
  )
  SELECT count(*) INTO _removed FROM deleted;

  RETURN jsonb_build_object(
    'success', true,
    'promoted', _promoted,
    'removed_from_reserve', _removed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.promote_reserve_to_pool() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.promote_reserve_to_pool() FROM anon;
REVOKE ALL ON FUNCTION public.promote_reserve_to_pool() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.promote_reserve_to_pool() TO service_role;
