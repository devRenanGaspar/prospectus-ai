CREATE OR REPLACE FUNCTION public.get_send_queue_batch()
RETURNS TABLE(
  out_lead_id uuid,
  out_user_id uuid,
  out_lead jsonb,
  out_agency jsonb,
  out_context jsonb,
  out_phone text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ranked AS (
    SELECT DISTINCT ON (l.user_id) l.*
    FROM public.leads l
    WHERE l.status = 'SEND_PENDING'
      AND l.user_id IS NOT NULL
    ORDER BY l.user_id, l.updated_at ASC
  )
  SELECT
    r.id AS out_lead_id,
    r.user_id AS out_user_id,
    to_jsonb(r) AS out_lead,
    jsonb_build_object(
      'agency_name', COALESCE(p.agency_name, ''),
      'business_type', COALESCE(p.business_type, 'trafego_pago'),
      'owner_name', COALESCE(p.owner_name, ''),
      'sdr_name', COALESCE(p.sdr_name, 'MarIA')
    ) AS out_agency,
    jsonb_build_object(
      'persona', p.context_persona,
      'icp', p.context_icp,
      'qualification', p.context_qualification
    ) AS out_context,
    COALESCE(p.whatsapp_number, '') AS out_phone
  FROM ranked r
  LEFT JOIN public.profiles p ON p.id = r.user_id;
$$;

REVOKE ALL ON FUNCTION public.get_send_queue_batch() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_send_queue_batch() FROM anon;
REVOKE ALL ON FUNCTION public.get_send_queue_batch() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_send_queue_batch() TO service_role;