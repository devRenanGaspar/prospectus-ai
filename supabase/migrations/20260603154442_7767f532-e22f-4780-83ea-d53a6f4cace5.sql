CREATE OR REPLACE FUNCTION public.get_pool_summary_by_category()
RETURNS TABLE (
  lead_category text,
  niche_name    text,
  leads_count   bigint,
  reserve_count bigint,
  total_count   bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH l AS (
    SELECT category_name, count(*) AS c
    FROM public.leads
    WHERE user_id IS NULL
    GROUP BY category_name
  ),
  r AS (
    SELECT category_name, count(*) AS c
    FROM public.leads_reserve
    WHERE user_id IS NULL
    GROUP BY category_name
  )
  SELECT
    n.lead_category,
    n.name AS niche_name,
    COALESCE(l.c, 0) AS leads_count,
    COALESCE(r.c, 0) AS reserve_count,
    COALESCE(l.c, 0) + COALESCE(r.c, 0) AS total_count
  FROM public.niche_options n
  LEFT JOIN l ON l.category_name = n.lead_category
  LEFT JOIN r ON r.category_name = n.lead_category
  WHERE n.lead_category IS NOT NULL
  ORDER BY total_count DESC, n.name ASC;
$$;

REVOKE ALL ON FUNCTION public.get_pool_summary_by_category() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_pool_summary_by_category() TO service_role;