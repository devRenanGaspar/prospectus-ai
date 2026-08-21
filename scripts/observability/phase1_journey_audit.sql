-- Aggregate journey audit. Outputs counts, ranges and coverage only.
with
copy_leads as (
  select distinct unnest(lead_ids) as lead_id from public.copy_requests
),
send_leads as (
  select distinct unnest(lead_ids) as lead_id from public.send_requests
),
message_leads as (
  select
    lead_id,
    bool_or(upper(sender) in ('AI', 'USER')) as has_outbound,
    bool_or(upper(sender) = 'LEAD') as has_inbound
  from public.messages
  group by lead_id
),
external_id_groups as (
  select
    external_message_id,
    count(*) as row_count,
    count(distinct lead_id) as lead_count,
    count(distinct sender) as sender_count
  from public.messages
  where external_message_id is not null
  group by external_message_id
  having count(*) > 1
)
select jsonb_build_object(
  'correlation_windows', (
    select jsonb_agg(to_jsonb(correlation) order by correlation.action_name)
    from (
      select
        action_name,
        count(*) as total_rows,
        count(*) filter (
          where (action_name = 'FIND_LEAD' and metadata ? 'search_id')
             or (action_name = 'GENERATE_COPY' and metadata ? 'copy_request_id')
             or (action_name = 'SEND_MESSAGE' and metadata ? 'send_request_id')
        ) as correlated_rows,
        min("timestamp") as first_any_at,
        min("timestamp") filter (
          where (action_name = 'FIND_LEAD' and metadata ? 'search_id')
             or (action_name = 'GENERATE_COPY' and metadata ? 'copy_request_id')
             or (action_name = 'SEND_MESSAGE' and metadata ? 'send_request_id')
        ) as first_correlated_at,
        max("timestamp") as last_at
      from public.usage_logs
      where action_name in ('FIND_LEAD', 'GENERATE_COPY', 'SEND_MESSAGE')
      group by action_name
    ) correlation
  ),
  'journey_stages', (
    select jsonb_agg(to_jsonb(stage) order by stage.stage_order)
    from (
      select 1 as stage_order, 'search_requested' as stage_name, count(*) as entity_count from public.lead_searches
      union all select 2, 'search_completed', count(*) from public.lead_searches where status = 'completed'
      union all select 3, 'search_with_lead', count(*) from public.lead_searches s where exists (select 1 from public.leads l where l.search_id = s.id)
      union all select 4, 'lead_discovered', count(*) from public.leads
      union all select 5, 'lead_linked_to_search', count(*) from public.leads where search_id is not null
      union all select 6, 'lead_copy_requested', count(*) from copy_leads
      union all select 7, 'lead_with_commercial_message', count(*) from public.leads where nullif(btrim(mensagem_abordagem_comercial), '') is not null
      union all select 8, 'lead_send_requested', count(*) from send_leads
      union all select 9, 'lead_with_outbound_message', count(*) from message_leads where has_outbound
      union all select 10, 'lead_with_inbound_message', count(*) from message_leads where has_inbound
      union all select 11, 'lead_scheduled', count(*) from public.leads where status in ('SCHEDULED', 'CLOSED_WON')
      union all select 12, 'lead_closed_won', count(*) from public.leads where status = 'CLOSED_WON'
    ) stage
  ),
  'monthly_timestamp_coverage', (
    select jsonb_agg(to_jsonb(monthly) order by monthly.source_name, monthly.month_start)
    from (
      select 'copy_requests.completed_at' as source_name, date_trunc('month', created_at)::date as month_start,
        count(*) as total_rows, count(completed_at) as covered_rows
      from public.copy_requests group by 2
      union all
      select 'lead_searches.completed_at', date_trunc('month', created_at)::date,
        count(*), count(completed_at)
      from public.lead_searches group by 2
      union all
      select 'send_requests.completed_at', date_trunc('month', created_at)::date,
        count(*), count(completed_at)
      from public.send_requests group by 2
    ) monthly
  ),
  'request_link_quality', (
    select jsonb_agg(to_jsonb(link_check) order by link_check.check_name)
    from (
      select
        'copy_request_missing_leads' as check_name,
        count(distinct c.id) as affected_requests,
        count(*) as affected_references,
        min(c.created_at) as first_at,
        max(c.created_at) as last_at
      from public.copy_requests c
      cross join lateral unnest(c.lead_ids) lead_id
      left join public.leads l on l.id = lead_id
      where l.id is null
      union all
      select 'send_request_missing_leads', count(distinct r.id), count(*), min(r.created_at), max(r.created_at)
      from public.send_requests r
      cross join lateral unnest(r.lead_ids) lead_id
      left join public.leads l on l.id = lead_id
      where l.id is null
      union all
      select 'search_leads_found_mismatch', count(*),
        coalesce(sum(abs(coalesce(s.leads_found, 0) - coalesce(delivered.delivered_count, 0))), 0),
        min(s.created_at), max(s.created_at)
      from public.lead_searches s
      left join (
        select search_id, count(*) as delivered_count
        from public.leads
        where search_id is not null
        group by search_id
      ) delivered on delivered.search_id = s.id
      where coalesce(s.leads_found, 0) <> coalesce(delivered.delivered_count, 0)
    ) link_check
  ),
  'message_duplicate_context', (
    select jsonb_build_object(
      'duplicate_id_groups', count(*),
      'excess_rows', coalesce(sum(row_count - 1), 0),
      'groups_spanning_multiple_leads', count(*) filter (where lead_count > 1),
      'groups_spanning_multiple_senders', count(*) filter (where sender_count > 1)
    )
    from external_id_groups
  ),
  'paid_state_coverage', (
    select jsonb_agg(to_jsonb(state_coverage) order by state_coverage.status)
    from (
      select
        status,
        count(*) as total_leads,
        count(*) filter (where nullif(btrim(mensagem_abordagem_comercial), '') is not null) as commercial_message_present,
        count(*) filter (where last_message_at is not null) as last_message_present
      from public.leads
      where status in ('COPY_PENDING', 'COPY_READY', 'SEND_PENDING', 'SENT', 'IN_CONVERSATION', 'FOLLOW_UP', 'SCHEDULED', 'CLOSED_WON', 'CLOSED_LOST')
      group by status
    ) state_coverage
  ),
  'ops_context', (
    select jsonb_agg(to_jsonb(ops_check) order by ops_check.check_name)
    from (
      select 'stuck_searches' as check_name, count(*) as finding_count, count(distinct user_id) as affected_users,
        min(created_at) as first_at, max(created_at) as last_at, null::bigint as aggregate_value
      from public.ops_stuck_searches
      union all
      select 'stuck_copy_requests', count(*), count(distinct user_id), min(created_at), max(created_at), null::bigint
      from public.ops_stuck_copy_requests
      union all
      select 'orphan_charges', count(*), count(distinct user_id), min(cobrado_em), max(cobrado_em), coalesce(sum(cost), 0)::bigint
      from public.ops_orphan_charges
      union all
      select 'double_sends', count(*), null::bigint, min(primeira), max(ultima), coalesce(sum(cobrancas), 0)::bigint
      from public.ops_double_sends
      union all
      select 'stuck_leads', count(*), count(distinct user_id), min(updated_at), max(updated_at), null::bigint
      from public.ops_stuck_leads
    ) ops_check
  )
) as journey_audit;
