-- Run after migrations in an isolated/local Supabase database.
-- The transaction is always rolled back.
begin;

do $$
begin
  if to_regclass('public.operational_events') is null
    or to_regclass('public.operation_runs') is null
    or to_regclass('public.queue_metric_snapshots') is null then
    raise exception 'observability tables are missing';
  end if;

  if not (
    select relrowsecurity
    from pg_class
    where oid = 'public.operational_events'::regclass
  ) then
    raise exception 'operational_events must have RLS enabled';
  end if;

  if (
    select count(*)
    from pg_trigger
    where not tgisinternal
      and tgname in (
        'leads_capture_status_event',
        'lead_searches_capture_lifecycle',
        'copy_requests_capture_lifecycle',
        'send_requests_capture_lifecycle'
      )
  ) <> 4 then
    raise exception 'lifecycle triggers are missing';
  end if;

  if has_table_privilege('authenticated', 'public.operational_events', 'INSERT')
    or has_table_privilege('authenticated', 'public.operation_runs', 'UPDATE')
    or has_table_privilege('anon', 'public.queue_metric_snapshots', 'SELECT') then
    raise exception 'telemetry privileges are broader than expected';
  end if;

  if not public.observability_attributes_are_safe(
    '{"metric":"LCP","rating":"good","sample_rate":0.1}'::jsonb
  ) then
    raise exception 'valid attributes were rejected';
  end if;

  if public.observability_attributes_are_safe('{"email":"private@example.invalid"}'::jsonb)
    or public.observability_attributes_are_safe('{"message":"raw content"}'::jsonb)
    or public.observability_attributes_are_safe('{"url":"https://internal.invalid"}'::jsonb)
    or public.observability_attributes_are_safe('{"stack":"raw stack"}'::jsonb) then
    raise exception 'privacy-sensitive attributes were accepted';
  end if;
end;
$$;

do $$
declare
  _event_id uuid := gen_random_uuid();
begin
  perform public.record_operational_event(
    _event_name => 'frontend.web_vital',
    _source => 'frontend',
    _event_id => _event_id,
    _session_id => gen_random_uuid(),
    _route_key => '/dashboard',
    _duration_ms => 1200,
    _attributes => '{"metric":"LCP","rating":"good"}'::jsonb
  );
  perform public.record_operational_event(
    _event_name => 'frontend.web_vital',
    _source => 'frontend',
    _event_id => _event_id,
    _session_id => gen_random_uuid(),
    _route_key => '/dashboard',
    _duration_ms => 1200,
    _attributes => '{"metric":"LCP","rating":"good"}'::jsonb
  );

  if (select count(*) from public.operational_events where event_id = _event_id) <> 1 then
    raise exception 'event ingestion is not idempotent';
  end if;
end;
$$;

do $$
begin
  begin
    insert into public.operational_events (
      event_name, source, route_key, attributes
    ) values (
      'frontend.error', 'frontend', '/dashboard?token=forbidden', '{}'::jsonb
    );
    raise exception 'unsafe route was accepted';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.operational_events (
      event_name, source, attributes
    ) values (
      'frontend.error', 'frontend', '{"message":"raw content"}'::jsonb
    );
    raise exception 'unsafe attributes were accepted';
  exception
    when check_violation then null;
  end;
end;
$$;

do $$
declare
  _correlation_id uuid := gen_random_uuid();
begin
  perform public.record_operation_run(
    _correlation_id => _correlation_id,
    _operation_type => 'generate_copy',
    _status => 'accepted',
    _source => 'edge',
    _request_id => gen_random_uuid()
  );
  perform public.record_operation_run(
    _correlation_id => _correlation_id,
    _operation_type => 'generate_copy',
    _status => 'completed',
    _source => 'n8n'
  );

  if not exists (
    select 1
    from public.operation_runs
    where correlation_id = _correlation_id
      and status = 'completed'
      and completed_at is not null
  ) then
    raise exception 'operation run upsert did not reach terminal state';
  end if;

  begin
    perform public.record_operation_run(
      _correlation_id => _correlation_id,
      _operation_type => 'generate_copy',
      _status => 'processing',
      _source => 'edge'
    );
    raise exception 'terminal operation accepted a state regression';
  exception
    when others then
      if sqlerrm <> 'OPERATION_ALREADY_TERMINAL' then
        raise;
      end if;
  end;
end;
$$;

rollback;
