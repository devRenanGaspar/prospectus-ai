-- Aggregate, read-only health snapshot for the admin operations console.
-- No row identifiers, customer attributes or payload contents are returned.
create or replace function public.get_admin_system_health()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  _result jsonb;
begin
  if auth.uid() is null or not public.is_admin(auth.uid()) then
    raise exception using errcode = '42501', message = 'ADMIN_ONLY';
  end if;

  select jsonb_build_object(
    'captured_at', now(),
    'telemetry', jsonb_build_object(
      'first_event_at', (select min(occurred_at) from public.operational_events),
      'last_event_at', (select max(occurred_at) from public.operational_events),
      'events_24h', (select count(*) from public.operational_events where occurred_at >= now() - interval '24 hours'),
      'errors_24h', (
        select count(*) from public.operational_events
        where occurred_at >= now() - interval '24 hours'
          and (error_code is not null or status = 'failed' or event_name like '%.failed')
      ),
      'frontend_errors_24h', (
        select count(*) from public.operational_events
        where occurred_at >= now() - interval '24 hours'
          and event_name = 'frontend.javascript_error'
      ),
      'frontend_sessions_24h', (
        select count(distinct session_id) from public.operational_events
        where occurred_at >= now() - interval '24 hours'
          and source = 'frontend' and session_id is not null
      ),
      'web_vitals_24h', (
        select count(*) from public.operational_events
        where occurred_at >= now() - interval '24 hours'
          and event_name = 'frontend.web_vital'
      )
    ),
    'stuck', jsonb_build_object(
      'searches', (select count(*) from public.ops_stuck_searches),
      'searches_oldest_seconds', (select coalesce(max(extract(epoch from idade)), 0) from public.ops_stuck_searches),
      'copy_requests', (select count(*) from public.ops_stuck_copy_requests),
      'copy_oldest_seconds', (select coalesce(max(extract(epoch from idade)), 0) from public.ops_stuck_copy_requests),
      'leads', (select count(*) from public.ops_stuck_leads),
      'copy_pending_leads', (select count(*) from public.ops_stuck_leads where status = 'COPY_PENDING'),
      'send_pending_leads', (select count(*) from public.ops_stuck_leads where status = 'SEND_PENDING'),
      'leads_oldest_seconds', (select coalesce(max(extract(epoch from parado_ha)), 0) from public.ops_stuck_leads)
    ),
    'operations', jsonb_build_object(
      'active', (
        select count(*) from public.operation_runs
        where status in ('accepted', 'queued', 'processing', 'dispatched', 'retrying')
      ),
      'queued', (select count(*) from public.operation_runs where status = 'queued'),
      'processing', (select count(*) from public.operation_runs where status = 'processing'),
      'failed', (select count(*) from public.operation_runs where status in ('failed', 'timed_out')),
      'oldest_active_at', (
        select min(started_at) from public.operation_runs
        where status in ('accepted', 'queued', 'processing', 'dispatched', 'retrying')
      )
    ),
    'queues', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'queue_name', queue_name,
            'captured_at', captured_at,
            'queue_depth', queue_depth,
            'oldest_age_seconds', oldest_age_seconds,
            'processing_count', processing_count,
            'failed_count', failed_count
          ) order by queue_name
        ),
        '[]'::jsonb
      ) from public.ops_queue_latest
    ),
    'coverage', jsonb_build_object(
      'synthetic_availability', false,
      'queue_snapshots', exists(select 1 from public.queue_metric_snapshots),
      'platform_metrics', false
    )
  ) into _result;

  return _result;
end;
$$;

revoke all on function public.get_admin_system_health() from public, anon, authenticated;
grant execute on function public.get_admin_system_health() to authenticated;
grant execute on function public.get_admin_system_health() to service_role;

comment on function public.get_admin_system_health() is
  'PII-free aggregate snapshot for the admin-only operations console.';
