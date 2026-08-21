-- ============================================================================
-- RPC admin para expor ops_copy_quality/copy_quality_daily na página
-- /admin/system-health (status atual, última execução do cron, último alerta).
--
-- SECURITY DEFINER (diferente de get_admin_system_health, que é INVOKER):
-- precisa ler cron.job/cron.job_run_details, que `authenticated` não tem
-- grant nenhum. O gate de admin é manual, igual às outras get_admin_*.
--
-- `is_regression` replica a mesma regra de
-- private.check_and_send_copy_quality_alert() — manter as duas em sincronia
-- se o limiar mudar (guarda de baseline zero dispara em qualquer ocorrência
-- nova; gate crônico só em taxa >2x a histórica, amostra mínima 5).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_admin_copy_quality()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
declare
  _result jsonb;
  _latest timestamptz;
begin
  if auth.uid() is null or not public.is_admin(auth.uid()) then
    raise exception using errcode = '42501', message = 'ADMIN_ONLY';
  end if;

  select max(captured_at) into _latest from public.copy_quality_daily;

  select jsonb_build_object(
    'last_captured_at', _latest,
    'schedule', (select schedule from cron.job where jobname = 'capture-copy-quality-daily'),
    'job_active', (select active from cron.job where jobname = 'capture-copy-quality-daily'),
    'last_run', (
      select jsonb_build_object('start_time', start_time, 'status', status)
      from cron.job_run_details
      where jobid = (select jobid from cron.job where jobname = 'capture-copy-quality-daily')
      order by start_time desc
      limit 1
    ),
    'last_alert_sent_at', (
      select max(created_at) from public.email_send_log
      where template_name = 'ops_copy_quality_alert' and status = 'sent'
    ),
    'checks', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'test_id', test_id,
            'check_name', check_name,
            'severity', severity,
            'universo_total', universo_total,
            'falhas_total', falhas_total,
            'taxa_total_pct', case when universo_total > 0
              then round(falhas_total::numeric / universo_total * 100, 1) else null end,
            'universo_24h', universo_24h,
            'falhas_24h', falhas_24h,
            'taxa_24h_pct', case when universo_24h > 0
              then round(falhas_24h::numeric / universo_24h * 100, 1) else null end,
            'is_regression', (
              case
                when severity = 'metrica' then false
                when check_name in ('nota_maxima_indevida', 'nega_site_existente', 'nega_instagram_existente')
                  then falhas_24h > 0
                when universo_24h >= 5 and falhas_24h > 0 and universo_total > 0 then
                  (falhas_total::numeric / universo_total) = 0
                  or (falhas_24h::numeric / universo_24h) > 2 * (falhas_total::numeric / universo_total)
                else false
              end
            )
          )
          order by check_name
        ),
        '[]'::jsonb
      )
      from public.copy_quality_daily
      where captured_at = _latest
    )
  ) into _result;

  return _result;
end;
$$;

REVOKE ALL ON FUNCTION public.get_admin_copy_quality() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_copy_quality() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_copy_quality() TO service_role;

COMMENT ON FUNCTION public.get_admin_copy_quality() IS
  'Admin-only. Snapshot mais recente de copy_quality_daily + status do cron (capture-copy-quality-daily) + último alerta enviado.';
