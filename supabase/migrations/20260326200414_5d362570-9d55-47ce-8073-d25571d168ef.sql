CREATE OR REPLACE FUNCTION public.get_lead_pool_summary()
RETURNS TABLE(category text, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(category_name, 'Sem categoria') AS category, count(*) AS count
  FROM public.leads
  WHERE user_id IS NULL
  GROUP BY category_name
  ORDER BY count DESC;
$$;