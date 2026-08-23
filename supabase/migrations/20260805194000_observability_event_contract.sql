-- Phase 3A: privacy-safe operational telemetry contract.
-- This migration is additive and does not backfill historical production data.

create or replace function public.observability_attributes_are_safe(_attributes jsonb)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select
    coalesce(jsonb_typeof(_attributes) = 'object', false)
    and pg_column_size(_attributes) <= 2048
    and not exists (
      select 1
      from jsonb_each(_attributes) attribute
      where not (attribute.key = any (array[
        'action',
        'attempt',
        'batch_size',
        'build',
        'connection_type',
        'http_status',
        'metric',
        'navigation_type',
        'oldest_age_seconds',
        'operation_stage',
        'provider',
        'queue_depth',
        'queue_name',
        'rating',
        'release',
        'result_count',
        'sample_rate',
        'status_from',
        'status_to',
        'visibility_state'
      ]::text[]))
      or jsonb_typeof(attribute.value) not in ('string', 'number', 'boolean', 'null')
      or (
        jsonb_typeof(attribute.value) = 'string'
        and length(attribute.value #>> '{}') > 128
      )
    );
$$;

create table public.operational_events (
  id bigint generated always as identity primary key,
  event_id uuid not null default gen_random_uuid() unique,
  event_name text not null,
  event_version smallint not null default 1,
  source text not null,
  occurred_at timestamptz not null default now(),
  received_at timestamptz not null default now(),
  correlation_id uuid,
  request_id uuid,
  session_id uuid,
  operation_type text,
  entity_type text,
  entity_id uuid,
  status text,
  route_key text,
  duration_ms integer,
  error_code text,
  attributes jsonb not null default '{}'::jsonb,
  constraint operational_events_name_format check (
    event_name ~ '^[a-z0-9][a-z0-9._-]{0,95}$'
  ),
  constraint operational_events_version_positive check (event_version > 0),
  constraint operational_events_source_allowed check (
    source in ('frontend', 'edge', 'database', 'n8n', 'scheduler')
  ),
  constraint operational_events_operation_format check (
    operation_type is null or operation_type ~ '^[a-z0-9][a-z0-9._-]{0,63}$'
  ),
  constraint operational_events_entity_format check (
    entity_type is null or entity_type ~ '^[a-z0-9][a-z0-9._-]{0,63}$'
  ),
  constraint operational_events_status_format check (
    status is null or status ~ '^[a-z0-9][a-z0-9._-]{0,63}$'
  ),
  constraint operational_events_route_format check (
    route_key is null or route_key = any (array[
      '/',
      '/login',
      '/check-email',
      '/reset-password',
      '/privacy',
      '/about',
      '/lp',
      '/vendas',
      '/dashboard',
      '/settings',
      '/context',
      '/leads/board',
      '/leads/:leadId',
      '/billing/plans',
      '/billing/usage',
      '/admin/users',
      '/admin/plans',
      '/admin/costs',
      '/admin/webhooks',
      '/admin/lead-pool',
      '/admin/maintenance',
      '/admin/announcements',
      '/not-found',
      'unknown'
    ]::text[])
  ),
  constraint operational_events_duration_range check (
    duration_ms is null or duration_ms between 0 and 604800000
  ),
  constraint operational_events_error_code_format check (
    error_code is null or error_code ~ '^[A-Z][A-Z0-9_]{0,63}$'
  ),
  constraint operational_events_safe_attributes check (
    public.observability_attributes_are_safe(attributes)
  )
);

comment on table public.operational_events is
  'Append-only operational events. No message content, names, email, phone, URLs or raw stack traces.';
comment on column public.operational_events.route_key is
  'Sanitized route template/key only; never a full URL, query string or fragment.';
comment on column public.operational_events.error_code is
  'Allowlisted machine code; never a raw exception message or stack trace.';

create index operational_events_occurred_at_idx
  on public.operational_events (occurred_at desc);
create index operational_events_name_time_idx
  on public.operational_events (event_name, occurred_at desc);
create index operational_events_correlation_idx
  on public.operational_events (correlation_id, occurred_at)
  where correlation_id is not null;
create index operational_events_request_idx
  on public.operational_events (request_id, occurred_at)
  where request_id is not null;
create index operational_events_error_time_idx
  on public.operational_events (occurred_at desc)
  where error_code is not null;

create table public.operation_runs (
  id bigint generated always as identity primary key,
  correlation_id uuid not null unique,
  request_id uuid,
  session_id uuid,
  operation_type text not null,
  status text not null,
  source text not null,
  started_at timestamptz not null,
  dispatched_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  attempt_count integer not null default 0,
  last_error_code text,
  attributes jsonb not null default '{}'::jsonb,
  constraint operation_runs_request_unique unique (operation_type, request_id),
  constraint operation_runs_type_format check (
    operation_type in (
      'find_leads',
      'generate_copy',
      'send_message',
      'webhook_dispatch',
      'email_delivery'
    )
  ),
  constraint operation_runs_status_allowed check (
    status in ('accepted', 'queued', 'dispatched', 'processing', 'completed', 'failed', 'timed_out', 'cancelled')
  ),
  constraint operation_runs_source_allowed check (
    source in ('frontend', 'edge', 'database', 'n8n', 'scheduler')
  ),
  constraint operation_runs_attempt_nonnegative check (attempt_count >= 0),
  constraint operation_runs_error_code_format check (
    last_error_code is null or last_error_code ~ '^[A-Z][A-Z0-9_]{0,63}$'
  ),
  constraint operation_runs_time_order check (
    (dispatched_at is null or dispatched_at >= started_at)
    and (completed_at is null or completed_at >= started_at)
  ),
  constraint operation_runs_safe_attributes check (
    public.observability_attributes_are_safe(attributes)
  )
);

comment on table public.operation_runs is
  'Current correlation state for critical operations. request_id is technical and payload-free.';

create index operation_runs_type_status_idx
  on public.operation_runs (operation_type, status, started_at desc);
create index operation_runs_incomplete_idx
  on public.operation_runs (started_at)
  where completed_at is null;

create index if not exists copy_requests_lead_ids_observability_idx
  on public.copy_requests using gin (lead_ids);
create index if not exists send_requests_lead_ids_observability_idx
  on public.send_requests using gin (lead_ids);

create table public.queue_metric_snapshots (
  id bigint generated always as identity primary key,
  captured_at timestamptz not null default now(),
  queue_name text not null,
  queue_depth integer not null,
  oldest_age_seconds integer,
  processing_count integer not null default 0,
  failed_count integer not null default 0,
  source text not null,
  correlation_id uuid,
  attributes jsonb not null default '{}'::jsonb,
  constraint queue_metric_name_format check (
    queue_name in (
      'lead_searches',
      'copy_requests',
      'send_requests',
      'auth_emails',
      'transactional_emails',
      'auth_emails_dlq',
      'transactional_emails_dlq'
    )
  ),
  constraint queue_metric_counts_nonnegative check (
    queue_depth >= 0
    and processing_count >= 0
    and failed_count >= 0
    and (oldest_age_seconds is null or oldest_age_seconds >= 0)
  ),
  constraint queue_metric_source_allowed check (
    source in ('edge', 'database', 'n8n', 'scheduler')
  ),
  constraint queue_metric_safe_attributes check (
    public.observability_attributes_are_safe(attributes)
  )
);

comment on table public.queue_metric_snapshots is
  'Aggregate queue snapshots only. Rows must never contain queue payloads or recipient data.';

create index queue_metric_snapshots_name_time_idx
  on public.queue_metric_snapshots (queue_name, captured_at desc);

alter table public.operational_events enable row level security;
alter table public.operation_runs enable row level security;
alter table public.queue_metric_snapshots enable row level security;

create policy "Admins read operational events"
  on public.operational_events for select to authenticated
  using (public.is_admin(auth.uid()));
create policy "Admins read operation runs"
  on public.operation_runs for select to authenticated
  using (public.is_admin(auth.uid()));
create policy "Admins read queue metric snapshots"
  on public.queue_metric_snapshots for select to authenticated
  using (public.is_admin(auth.uid()));

revoke all on table public.operational_events from public, anon, authenticated;
revoke all on table public.operation_runs from public, anon, authenticated;
revoke all on table public.queue_metric_snapshots from public, anon, authenticated;

grant select on table public.operational_events to authenticated;
grant select on table public.operation_runs to authenticated;
grant select on table public.queue_metric_snapshots to authenticated;

grant select, insert on table public.operational_events to service_role;
grant select, insert, update on table public.operation_runs to service_role;
grant select, insert on table public.queue_metric_snapshots to service_role;

grant usage, select on sequence public.operational_events_id_seq to service_role;
grant usage, select on sequence public.operation_runs_id_seq to service_role;
grant usage, select on sequence public.queue_metric_snapshots_id_seq to service_role;

create or replace function public.set_observability_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger operation_runs_set_updated_at
before update on public.operation_runs
for each row execute function public.set_observability_updated_at();

create or replace function public.record_operational_event(
  _event_name text,
  _source text,
  _event_id uuid default null,
  _occurred_at timestamptz default now(),
  _correlation_id uuid default null,
  _request_id uuid default null,
  _session_id uuid default null,
  _operation_type text default null,
  _entity_type text default null,
  _entity_id uuid default null,
  _status text default null,
  _route_key text default null,
  _duration_ms integer default null,
  _error_code text default null,
  _attributes jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _resolved_event_id uuid := coalesce(_event_id, gen_random_uuid());
begin
  insert into public.operational_events (
    event_id, event_name, source, occurred_at, correlation_id, request_id,
    session_id, operation_type, entity_type, entity_id, status, route_key,
    duration_ms, error_code, attributes
  ) values (
    _resolved_event_id, _event_name, _source, coalesce(_occurred_at, now()),
    _correlation_id, _request_id, _session_id, _operation_type, _entity_type,
    _entity_id, _status, _route_key, _duration_ms, _error_code,
    coalesce(_attributes, '{}'::jsonb)
  )
  on conflict (event_id) do nothing;

  return _resolved_event_id;
end;
$$;

create or replace function public.record_operation_run(
  _correlation_id uuid,
  _operation_type text,
  _status text,
  _source text,
  _occurred_at timestamptz default now(),
  _request_id uuid default null,
  _session_id uuid default null,
  _attempt_increment boolean default false,
  _error_code text default null,
  _attributes jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _at timestamptz := coalesce(_occurred_at, now());
  _existing public.operation_runs%rowtype;
begin
  if _correlation_id is null then
    raise exception 'CORRELATION_ID_REQUIRED';
  end if;

  select * into _existing
  from public.operation_runs
  where correlation_id = _correlation_id
  for update;

  if found and _existing.operation_type <> _operation_type then
    raise exception 'CORRELATION_OPERATION_MISMATCH';
  end if;
  if found
    and _existing.request_id is not null
    and _request_id is not null
    and _existing.request_id <> _request_id then
    raise exception 'CORRELATION_REQUEST_MISMATCH';
  end if;
  if found
    and _existing.status in ('completed', 'failed', 'timed_out', 'cancelled')
    and _existing.status <> _status then
    raise exception 'OPERATION_ALREADY_TERMINAL';
  end if;

  insert into public.operation_runs (
    correlation_id, request_id, session_id, operation_type, status, source,
    started_at, dispatched_at, completed_at, attempt_count, last_error_code,
    attributes
  ) values (
    _correlation_id, _request_id, _session_id, _operation_type, _status, _source,
    _at,
    case when _status = 'dispatched' then _at end,
    case when _status in ('completed', 'failed', 'timed_out', 'cancelled') then _at end,
    case when _attempt_increment then 1 else 0 end,
    _error_code,
    coalesce(_attributes, '{}'::jsonb)
  )
  on conflict (correlation_id) do update set
    request_id = coalesce(public.operation_runs.request_id, excluded.request_id),
    session_id = coalesce(public.operation_runs.session_id, excluded.session_id),
    status = case
      when public.operation_runs.status in ('completed', 'failed', 'timed_out', 'cancelled')
        then public.operation_runs.status
      else excluded.status
    end,
    source = excluded.source,
    dispatched_at = coalesce(
      public.operation_runs.dispatched_at,
      case when excluded.status = 'dispatched' then _at end
    ),
    completed_at = coalesce(
      public.operation_runs.completed_at,
      case when excluded.status in ('completed', 'failed', 'timed_out', 'cancelled') then _at end
    ),
    attempt_count = public.operation_runs.attempt_count
      + case when _attempt_increment then 1 else 0 end,
    last_error_code = coalesce(excluded.last_error_code, public.operation_runs.last_error_code),
    attributes = public.operation_runs.attributes || excluded.attributes;

  return _correlation_id;
end;
$$;

create or replace function public.record_queue_metric(
  _queue_name text,
  _queue_depth integer,
  _source text,
  _captured_at timestamptz default now(),
  _oldest_age_seconds integer default null,
  _processing_count integer default 0,
  _failed_count integer default 0,
  _correlation_id uuid default null,
  _attributes jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _id bigint;
begin
  insert into public.queue_metric_snapshots (
    captured_at, queue_name, queue_depth, oldest_age_seconds, processing_count,
    failed_count, source, correlation_id, attributes
  ) values (
    coalesce(_captured_at, now()), _queue_name, _queue_depth,
    _oldest_age_seconds, coalesce(_processing_count, 0),
    coalesce(_failed_count, 0), _source, _correlation_id,
    coalesce(_attributes, '{}'::jsonb)
  )
  returning id into _id;

  return _id;
end;
$$;

revoke all on function public.observability_attributes_are_safe(jsonb) from public, anon, authenticated;
revoke all on function public.set_observability_updated_at() from public, anon, authenticated;
revoke all on function public.record_operational_event(text, text, uuid, timestamptz, uuid, uuid, uuid, text, text, uuid, text, text, integer, text, jsonb) from public, anon, authenticated;
revoke all on function public.record_operation_run(uuid, text, text, text, timestamptz, uuid, uuid, boolean, text, jsonb) from public, anon, authenticated;
revoke all on function public.record_queue_metric(text, integer, text, timestamptz, integer, integer, integer, uuid, jsonb) from public, anon, authenticated;

grant execute on function public.observability_attributes_are_safe(jsonb) to service_role;
grant execute on function public.record_operational_event(text, text, uuid, timestamptz, uuid, uuid, uuid, text, text, uuid, text, text, integer, text, jsonb) to service_role;
grant execute on function public.record_operation_run(uuid, text, text, text, timestamptz, uuid, uuid, boolean, text, jsonb) to service_role;
grant execute on function public.record_queue_metric(text, integer, text, timestamptz, integer, integer, integer, uuid, jsonb) to service_role;

create or replace function public.capture_lead_status_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _correlation_text text := current_setting('app.correlation_id', true);
  _request_text text := current_setting('app.request_id', true);
  _correlation_id uuid;
  _request_id uuid;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if _correlation_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    _correlation_id := _correlation_text::uuid;
  end if;
  if _request_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    _request_id := _request_text::uuid;
  end if;

  -- Paid lead transitions can be correlated without changing the existing
  -- RPC signatures because the request row is inserted before the lead update.
  if _request_id is null
    and (new.status in ('SEND_PENDING', 'SENT', 'IN_CONVERSATION') or old.status = 'SEND_PENDING') then
    select request.id into _request_id
    from public.send_requests request
    where request.user_id = new.user_id
      and request.lead_ids @> array[new.id]
    order by request.created_at desc
    limit 1;
  end if;

  if _request_id is null
    and (new.status in ('COPY_PENDING', 'COPY_READY') or old.status = 'COPY_PENDING') then
    select request.id into _request_id
    from public.copy_requests request
    where request.user_id = new.user_id
      and request.lead_ids @> array[new.id]
    order by request.created_at desc
    limit 1;
  end if;

  _correlation_id := coalesce(_correlation_id, _request_id);

  insert into public.operational_events (
    event_name, source, occurred_at, correlation_id, request_id,
    entity_type, entity_id, status, attributes
  ) values (
    'lead.status_changed', 'database', now(), _correlation_id, _request_id,
    'lead', new.id, lower(new.status),
    jsonb_build_object('status_from', old.status, 'status_to', new.status)
  );

  return new;
end;
$$;

create trigger leads_capture_status_event
after update of status on public.leads
for each row execute function public.capture_lead_status_event();

create or replace function public.capture_request_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _operation_type text;
  _normalized_status text;
  _terminal_at timestamptz;
  _status_from text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  _status_from := case when tg_op = 'UPDATE' then old.status end;

  if tg_table_name = 'lead_searches' then
    _operation_type := 'find_leads';
    _normalized_status := case new.status
      when 'pending' then 'accepted'
      when 'processing' then 'processing'
      when 'completed' then 'completed'
      when 'failed' then 'failed'
      else 'processing'
    end;
  elsif tg_table_name = 'copy_requests' then
    _operation_type := 'generate_copy';
    _normalized_status := case new.status
      when 'pending' then 'accepted'
      when 'processing' then 'processing'
      when 'completed' then 'completed'
      when 'failed' then 'failed'
      else 'processing'
    end;
  else
    _operation_type := 'send_message';
    _normalized_status := case new.status
      when 'failed' then 'failed'
      else 'queued'
    end;
  end if;

  if _normalized_status in ('completed', 'failed') then
    _terminal_at := coalesce(new.completed_at, now());
  end if;

  insert into public.operation_runs (
    correlation_id, request_id, operation_type, status, source, started_at,
    completed_at
  ) values (
    new.id, new.id, _operation_type, _normalized_status, 'database',
    new.created_at, _terminal_at
  )
  on conflict (operation_type, request_id) do update set
    status = case
      when public.operation_runs.status in ('completed', 'failed', 'timed_out', 'cancelled')
        and excluded.status not in ('completed', 'failed', 'timed_out', 'cancelled')
        then public.operation_runs.status
      else excluded.status
    end,
    source = excluded.source,
    completed_at = coalesce(excluded.completed_at, public.operation_runs.completed_at);

  insert into public.operational_events (
    event_name, source, occurred_at, correlation_id, request_id,
    operation_type, entity_type, entity_id, status, attributes
  ) values (
    case when tg_op = 'INSERT' then 'operation.requested' else 'operation.status_changed' end,
    'database', now(), new.id, new.id, _operation_type, 'request', new.id,
    _normalized_status,
    jsonb_strip_nulls(jsonb_build_object(
      'status_from', _status_from,
      'status_to', new.status
    ))
  );

  return new;
end;
$$;

create trigger lead_searches_capture_lifecycle
after insert or update of status on public.lead_searches
for each row execute function public.capture_request_lifecycle();

create trigger copy_requests_capture_lifecycle
after insert or update of status on public.copy_requests
for each row execute function public.capture_request_lifecycle();

create trigger send_requests_capture_lifecycle
after insert or update of status on public.send_requests
for each row execute function public.capture_request_lifecycle();

revoke all on function public.capture_lead_status_event() from public, anon, authenticated;
revoke all on function public.capture_request_lifecycle() from public, anon, authenticated;

create or replace view public.ops_event_metrics_hourly
with (security_invoker = true) as
select
  date_trunc('hour', occurred_at) as hour_start,
  event_name,
  source,
  operation_type,
  status,
  count(*) as event_count,
  count(*) filter (where error_code is not null) as error_count,
  percentile_cont(0.50) within group (order by duration_ms)
    filter (where duration_ms is not null) as p50_duration_ms,
  percentile_cont(0.95) within group (order by duration_ms)
    filter (where duration_ms is not null) as p95_duration_ms,
  percentile_cont(0.99) within group (order by duration_ms)
    filter (where duration_ms is not null) as p99_duration_ms
from public.operational_events
group by date_trunc('hour', occurred_at), event_name, source, operation_type, status;

create or replace view public.ops_operation_health
with (security_invoker = true) as
select
  operation_type,
  status,
  count(*) as operation_count,
  min(started_at) as oldest_started_at,
  percentile_cont(0.50) within group (order by extract(epoch from completed_at - started_at) * 1000)
    filter (where completed_at is not null) as p50_duration_ms,
  percentile_cont(0.95) within group (order by extract(epoch from completed_at - started_at) * 1000)
    filter (where completed_at is not null) as p95_duration_ms,
  percentile_cont(0.99) within group (order by extract(epoch from completed_at - started_at) * 1000)
    filter (where completed_at is not null) as p99_duration_ms
from public.operation_runs
group by operation_type, status;

create or replace view public.ops_queue_latest
with (security_invoker = true) as
select distinct on (queue_name)
  queue_name,
  captured_at,
  queue_depth,
  oldest_age_seconds,
  processing_count,
  failed_count,
  source
from public.queue_metric_snapshots
order by queue_name, captured_at desc;

revoke all on public.ops_event_metrics_hourly from public, anon;
revoke all on public.ops_operation_health from public, anon;
revoke all on public.ops_queue_latest from public, anon;

grant select on public.ops_event_metrics_hourly to authenticated;
grant select on public.ops_operation_health to authenticated;
grant select on public.ops_queue_latest to authenticated;
