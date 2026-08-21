-- Historical operational baseline.
-- Detailed snapshots are retained for 90 days; hourly rollups for two years.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.system_health_snapshots (
  id bigint generated always as identity primary key,
  captured_at timestamptz not null default now(),
  stuck_searches integer not null check (stuck_searches >= 0),
  stuck_copy_requests integer not null check (stuck_copy_requests >= 0),
  stuck_leads integer not null check (stuck_leads >= 0),
  copy_pending_leads integer not null check (copy_pending_leads >= 0),
  send_pending_leads integer not null check (send_pending_leads >= 0),
  telemetry_events_24h integer not null check (telemetry_events_24h >= 0),
  telemetry_errors_24h integer not null check (telemetry_errors_24h >= 0),
  frontend_errors_24h integer not null check (frontend_errors_24h >= 0),
  web_vitals_24h integer not null check (web_vitals_24h >= 0),
  operations_active integer not null check (operations_active >= 0),
  operations_queued integer not null check (operations_queued >= 0),
  operations_processing integer not null check (operations_processing >= 0),
  operations_failed integer not null check (operations_failed >= 0),
  queue_depth integer check (queue_depth is null or queue_depth >= 0),
  queue_snapshot_count integer not null check (queue_snapshot_count >= 0)
);

create index system_health_snapshots_captured_at_idx
  on public.system_health_snapshots (captured_at desc);

alter table public.system_health_snapshots enable row level security;

create policy "Admins read system health snapshots"
  on public.system_health_snapshots for select to authenticated
  using (public.is_admin((select auth.uid())));

revoke all on table public.system_health_snapshots from public, anon, authenticated;
grant select on table public.system_health_snapshots to authenticated;
grant select, insert, delete on table public.system_health_snapshots to service_role;
grant usage, select on sequence public.system_health_snapshots_id_seq to service_role;

comment on table public.system_health_snapshots is
  'PII-free operational health snapshots captured every five minutes.';

create table public.system_health_hourly (
  bucket_at timestamptz primary key,
  samples_count integer not null check (samples_count > 0),
  avg_stuck_total numeric not null,
  max_stuck_total integer not null,
  avg_telemetry_errors_24h numeric not null,
  max_telemetry_errors_24h integer not null,
  avg_operations_active numeric not null,
  max_operations_active integer not null,
  avg_queue_depth numeric,
  max_queue_depth integer,
  rolled_up_at timestamptz not null default now()
);

alter table public.system_health_hourly enable row level security;

create policy "Admins read hourly system health"
  on public.system_health_hourly for select to authenticated
  using (public.is_admin((select auth.uid())));

revoke all on table public.system_health_hourly from public, anon, authenticated;
grant select on table public.system_health_hourly to authenticated;
grant select, insert, update, delete on table public.system_health_hourly to service_role;

comment on table public.system_health_hourly is
  'Hourly PII-free operational health rollups retained for two years.';

create or replace function private.capture_system_health_snapshot()
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _captured_at timestamptz := now();
  _id bigint;
begin
  insert into public.system_health_snapshots (
    captured_at,
    stuck_searches,
    stuck_copy_requests,
    stuck_leads,
    copy_pending_leads,
    send_pending_leads,
    telemetry_events_24h,
    telemetry_errors_24h,
    frontend_errors_24h,
    web_vitals_24h,
    operations_active,
    operations_queued,
    operations_processing,
    operations_failed,
    queue_depth,
    queue_snapshot_count
  )
  select
    _captured_at,
    (select count(*) from public.ops_stuck_searches),
    (select count(*) from public.ops_stuck_copy_requests),
    (select count(*) from public.ops_stuck_leads),
    (select count(*) from public.ops_stuck_leads where status = 'COPY_PENDING'),
    (select count(*) from public.ops_stuck_leads where status = 'SEND_PENDING'),
    (select count(*) from public.operational_events where occurred_at >= _captured_at - interval '24 hours'),
    (
      select count(*) from public.operational_events
      where occurred_at >= _captured_at - interval '24 hours'
        and (error_code is not null or status = 'failed' or event_name like '%.failed')
    ),
    (
      select count(*) from public.operational_events
      where occurred_at >= _captured_at - interval '24 hours'
        and event_name = 'frontend.javascript_error'
    ),
    (
      select count(*) from public.operational_events
      where occurred_at >= _captured_at - interval '24 hours'
        and event_name = 'frontend.web_vital'
    ),
    (
      select count(*) from public.operation_runs
      where status in ('accepted', 'queued', 'processing', 'dispatched', 'retrying')
    ),
    (select count(*) from public.operation_runs where status = 'queued'),
    (select count(*) from public.operation_runs where status = 'processing'),
    (select count(*) from public.operation_runs where status in ('failed', 'timed_out')),
    (select sum(queue_depth)::integer from public.ops_queue_latest),
    (select count(*) from public.ops_queue_latest)
  returning id into _id;

  return _id;
end;
$$;

revoke all on function private.capture_system_health_snapshot() from public, anon, authenticated;
grant execute on function private.capture_system_health_snapshot() to postgres;

comment on function private.capture_system_health_snapshot() is
  'Cron-only collector for the PII-free operational baseline.';

create or replace function private.rollup_system_health_history()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.system_health_hourly (
    bucket_at,
    samples_count,
    avg_stuck_total,
    max_stuck_total,
    avg_telemetry_errors_24h,
    max_telemetry_errors_24h,
    avg_operations_active,
    max_operations_active,
    avg_queue_depth,
    max_queue_depth,
    rolled_up_at
  )
  select
    date_trunc('hour', captured_at),
    count(*)::integer,
    avg(stuck_searches + stuck_copy_requests + stuck_leads),
    max(stuck_searches + stuck_copy_requests + stuck_leads),
    avg(telemetry_errors_24h),
    max(telemetry_errors_24h),
    avg(operations_active),
    max(operations_active),
    avg(queue_depth),
    max(queue_depth),
    now()
  from public.system_health_snapshots
  where captured_at >= date_trunc('hour', now()) - interval '2 hours'
    and captured_at < date_trunc('hour', now())
  group by date_trunc('hour', captured_at)
  on conflict (bucket_at) do update set
    samples_count = excluded.samples_count,
    avg_stuck_total = excluded.avg_stuck_total,
    max_stuck_total = excluded.max_stuck_total,
    avg_telemetry_errors_24h = excluded.avg_telemetry_errors_24h,
    max_telemetry_errors_24h = excluded.max_telemetry_errors_24h,
    avg_operations_active = excluded.avg_operations_active,
    max_operations_active = excluded.max_operations_active,
    avg_queue_depth = excluded.avg_queue_depth,
    max_queue_depth = excluded.max_queue_depth,
    rolled_up_at = excluded.rolled_up_at;

  delete from public.system_health_snapshots
  where captured_at < now() - interval '90 days';

  delete from public.system_health_hourly
  where bucket_at < now() - interval '730 days';
end;
$$;

revoke all on function private.rollup_system_health_history() from public, anon, authenticated;
grant execute on function private.rollup_system_health_history() to postgres;

comment on function private.rollup_system_health_history() is
  'Cron-only hourly rollup and retention maintenance for operational history.';

create or replace function public.get_admin_system_health_history(_hours integer default 168)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  _safe_hours integer := least(greatest(coalesce(_hours, 168), 1), 2160);
  _result jsonb;
begin
  if auth.uid() is null or not public.is_admin(auth.uid()) then
    raise exception using errcode = '42501', message = 'ADMIN_ONLY';
  end if;

  with selected as (
    select *
    from public.system_health_snapshots
    where captured_at >= now() - make_interval(hours => _safe_hours)
  ),
  reference as (
    select *
    from public.system_health_snapshots
    where captured_at >= now() - interval '28 days'
      and captured_at < now() - interval '1 hour'
      and extract(hour from captured_at at time zone 'America/Sao_Paulo') =
          extract(hour from now() at time zone 'America/Sao_Paulo')
  ),
  reference_stats as (
    select
      count(*)::integer as samples,
      percentile_cont(0.5) within group (order by stuck_searches + stuck_copy_requests + stuck_leads) as stuck_median,
      percentile_cont(0.1) within group (order by stuck_searches + stuck_copy_requests + stuck_leads) as stuck_p10,
      percentile_cont(0.9) within group (order by stuck_searches + stuck_copy_requests + stuck_leads) as stuck_p90,
      percentile_cont(0.5) within group (order by telemetry_errors_24h) as errors_median,
      percentile_cont(0.1) within group (order by telemetry_errors_24h) as errors_p10,
      percentile_cont(0.9) within group (order by telemetry_errors_24h) as errors_p90,
      percentile_cont(0.5) within group (order by operations_active) as active_median,
      percentile_cont(0.1) within group (order by operations_active) as active_p10,
      percentile_cont(0.9) within group (order by operations_active) as active_p90,
      percentile_cont(0.5) within group (order by queue_depth) filter (where queue_depth is not null) as queue_median,
      percentile_cont(0.1) within group (order by queue_depth) filter (where queue_depth is not null) as queue_p10,
      percentile_cont(0.9) within group (order by queue_depth) filter (where queue_depth is not null) as queue_p90
    from reference
  )
  select jsonb_build_object(
    'frequency_minutes', 5,
    'retention_days', 90,
    'rollup_retention_days', 730,
    'window_hours', _safe_hours,
    'first_captured_at', (select min(captured_at) from public.system_health_snapshots),
    'last_captured_at', (select max(captured_at) from public.system_health_snapshots),
    'samples', (select count(*) from selected),
    'expected_samples', _safe_hours * 12,
    'reference', (
      select jsonb_build_object(
        'status', case when samples >= 36 then 'ready' else 'collecting' end,
        'samples', samples,
        'minimum_samples', 36,
        'lookback_days', 28,
        'comparison', 'same_hour_of_day',
        'metrics', jsonb_build_object(
          'stuck_total', jsonb_build_object('median', stuck_median, 'p10', stuck_p10, 'p90', stuck_p90),
          'telemetry_errors_24h', jsonb_build_object('median', errors_median, 'p10', errors_p10, 'p90', errors_p90),
          'operations_active', jsonb_build_object('median', active_median, 'p10', active_p10, 'p90', active_p90),
          'queue_depth', jsonb_build_object('median', queue_median, 'p10', queue_p10, 'p90', queue_p90)
        )
      ) from reference_stats
    )
  ) into _result;

  return _result;
end;
$$;

revoke all on function public.get_admin_system_health_history(integer) from public, anon, authenticated;
grant execute on function public.get_admin_system_health_history(integer) to authenticated;
grant execute on function public.get_admin_system_health_history(integer) to service_role;

comment on function public.get_admin_system_health_history(integer) is
  'Admin-only baseline coverage and same-hour reference distribution.';

do $$
declare
  _job_id bigint;
begin
  select jobid into _job_id from cron.job where jobname = 'capture-operational-baseline';
  if _job_id is not null then
    perform cron.unschedule(_job_id);
  end if;

  perform cron.schedule(
    'capture-operational-baseline',
    '*/5 * * * *',
    $job$select private.capture_system_health_snapshot();$job$
  );

  select jobid into _job_id from cron.job where jobname = 'rollup-operational-baseline';
  if _job_id is not null then
    perform cron.unschedule(_job_id);
  end if;

  perform cron.schedule(
    'rollup-operational-baseline',
    '10 * * * *',
    $job$select private.rollup_system_health_history();$job$
  );
end;
$$;

-- Establish the first durable point immediately; cron continues every 5 minutes.
select private.capture_system_health_snapshot();
