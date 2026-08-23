-- Historical operational baseline by approved rolling window.
-- Aggregate-only, read-only and free of row identifiers or customer data.
with
clock as (
  select now() as as_of
),
source_start as (
  select min(first_at) as first_at
  from (
    select min(created_at) as first_at from auth.users
    union all select min(created_at) from public.lead_searches
    union all select min(created_at) from public.copy_requests
    union all select min(created_at) from public.send_requests
    union all select min("timestamp") from public.messages
    union all select min("timestamp") from public.usage_logs
  ) starts
),
windows as (
  select 'complete'::text as window_name, source_start.first_at as window_start, clock.as_of as window_end
  from source_start cross join clock
  union all
  select 'last_90d', clock.as_of - interval '90 days', clock.as_of from clock
  union all
  select 'last_30d', clock.as_of - interval '30 days', clock.as_of from clock
  union all
  select 'last_7d', clock.as_of - interval '7 days', clock.as_of from clock
),
search_rollup as (
  select
    w.window_name,
    count(s.*) as total,
    count(*) filter (where s.status = 'completed') as completed,
    count(*) filter (where s.status = 'failed') as failed,
    count(*) filter (where s.refunded_at is not null) as refunded
  from windows w
  left join public.lead_searches s
    on s.created_at >= w.window_start and s.created_at < w.window_end
  group by w.window_name
),
copy_rollup as (
  select
    w.window_name,
    count(c.*) as total,
    count(*) filter (where c.status = 'completed') as completed,
    count(*) filter (where c.status = 'failed') as failed
  from windows w
  left join public.copy_requests c
    on c.created_at >= w.window_start and c.created_at < w.window_end
  group by w.window_name
),
send_rollup as (
  select
    w.window_name,
    count(r.*) as total,
    count(*) filter (where r.status = 'completed') as completed,
    count(*) filter (where r.status = 'failed') as failed
  from windows w
  left join public.send_requests r
    on r.created_at >= w.window_start and r.created_at < w.window_end
  group by w.window_name
),
send_request_leads as (
  select r.id as request_id, r.created_at, lead_id
  from public.send_requests r
  cross join lateral unnest(r.lead_ids) lead_id
),
send_delivery_rollup as (
  select
    w.window_name,
    count(srl.*) as requested_leads,
    count(*) filter (
      where exists (
        select 1
        from public.messages m
        where m.lead_id = srl.lead_id
          and upper(m.sender) in ('AI', 'USER')
          and m."timestamp" >= srl.created_at
      )
    ) as leads_with_later_outbound
  from windows w
  left join send_request_leads srl
    on srl.created_at >= w.window_start and srl.created_at < w.window_end
  group by w.window_name
),
first_outbound as (
  select lead_id, min("timestamp") as first_outbound_at
  from public.messages
  where upper(sender) in ('AI', 'USER')
  group by lead_id
),
first_touch as (
  select
    o.lead_id,
    o.first_outbound_at,
    min(m."timestamp") as first_response_at
  from first_outbound o
  left join public.messages m
    on m.lead_id = o.lead_id
   and upper(m.sender) = 'LEAD'
   and m."timestamp" > o.first_outbound_at
  group by o.lead_id, o.first_outbound_at
),
response_rollup as (
  select
    w.window_name,
    count(ft.*) as outbound_leads,
    count(ft.first_response_at) as responded_leads
  from windows w
  left join first_touch ft
    on ft.first_outbound_at >= w.window_start and ft.first_outbound_at < w.window_end
  group by w.window_name
),
credit_rollup as (
  select
    w.window_name,
    coalesce(sum(u.cost) filter (where u.cost > 0), 0) as charged_credits,
    coalesce(abs(sum(u.cost) filter (where u.action_name = 'FIND_LEAD_REFUND' and u.cost < 0)), 0) as refunded_search_credits,
    coalesce(sum(u.cost) filter (where u.action_name = 'FIND_LEAD' and u.cost > 0), 0) as charged_search_credits
  from windows w
  left join public.usage_logs u
    on u."timestamp" >= w.window_start and u."timestamp" < w.window_end
  group by w.window_name
),
signup_rollup as (
  select w.window_name, count(u.*) as signups
  from windows w
  left join auth.users u
    on u.created_at >= w.window_start and u.created_at < w.window_end
  group by w.window_name
),
correlation_rollup as (
  select
    w.window_name,
    actions.action_name,
    count(u.*) as charged_rows,
    count(*) filter (
      where (u.action_name = 'FIND_LEAD' and u.metadata ? 'search_id')
         or (u.action_name = 'GENERATE_COPY' and u.metadata ? 'copy_request_id')
         or (u.action_name = 'SEND_MESSAGE' and u.metadata ? 'send_request_id')
    ) as correlated_rows
  from windows w
  cross join (values ('FIND_LEAD'), ('GENERATE_COPY'), ('SEND_MESSAGE')) actions(action_name)
  left join public.usage_logs u
    on u.action_name = actions.action_name
   and u."timestamp" >= w.window_start and u."timestamp" < w.window_end
  group by w.window_name, actions.action_name
),
metric_rows as (
  select 'OPS-001'::text as metric_id, 'Search request volume'::text as metric_name,
    w.window_name, w.window_start, w.window_end, s.total::numeric as value,
    'requests'::text as unit, s.total::numeric as numerator, null::numeric as denominator,
    s.total as sample_size, 'A'::text as confidence,
    'count(lead_searches created in window)'::text as formula
  from windows w join search_rollup s using (window_name)
  union all
  select 'OPS-002', 'Search completion rate', w.window_name, w.window_start, w.window_end,
    round(100.0 * s.completed / nullif(s.total, 0), 2), 'percent', s.completed, s.total,
    s.total, 'A', 'completed searches / searches created in window * 100'
  from windows w join search_rollup s using (window_name)
  union all
  select 'OPS-002.failure', 'Search failure rate', w.window_name, w.window_start, w.window_end,
    round(100.0 * s.failed / nullif(s.total, 0), 2), 'percent', s.failed, s.total,
    s.total, 'A', 'failed searches / searches created in window * 100'
  from windows w join search_rollup s using (window_name)
  union all
  select 'OPS-004', 'Search refund rate', w.window_name, w.window_start, w.window_end,
    round(100.0 * s.refunded / nullif(s.total, 0), 2), 'percent', s.refunded, s.total,
    s.total, 'A', 'searches with refunded_at / searches created in window * 100'
  from windows w join search_rollup s using (window_name)
  union all
  select 'OPS-006', 'Copy request volume', w.window_name, w.window_start, w.window_end,
    c.total, 'requests', c.total, null, c.total, 'A', 'count(copy_requests created in window)'
  from windows w join copy_rollup c using (window_name)
  union all
  select 'OPS-007', 'Copy completion rate', w.window_name, w.window_start, w.window_end,
    round(100.0 * c.completed / nullif(c.total, 0), 2), 'percent', c.completed, c.total,
    c.total, 'A', 'completed copy requests / copy requests created in window * 100'
  from windows w join copy_rollup c using (window_name)
  union all
  select 'OPS-007.failure', 'Copy failure rate', w.window_name, w.window_start, w.window_end,
    round(100.0 * c.failed / nullif(c.total, 0), 2), 'percent', c.failed, c.total,
    c.total, 'A', 'failed copy requests / copy requests created in window * 100'
  from windows w join copy_rollup c using (window_name)
  union all
  select 'OPS-009', 'Send request volume', w.window_name, w.window_start, w.window_end,
    s.total, 'requests', s.total, null, s.total, 'A', 'count(send_requests created in window)'
  from windows w join send_rollup s using (window_name)
  union all
  select 'OPS-010', 'Send completion rate', w.window_name, w.window_start, w.window_end,
    round(100.0 * s.completed / nullif(s.total, 0), 2), 'percent', s.completed, s.total,
    s.total, 'A', 'completed send requests / send requests created in window * 100'
  from windows w join send_rollup s using (window_name)
  union all
  select 'OPS-010.failure', 'Send failure rate', w.window_name, w.window_start, w.window_end,
    round(100.0 * s.failed / nullif(s.total, 0), 2), 'percent', s.failed, s.total,
    s.total, 'A', 'failed send requests / send requests created in window * 100'
  from windows w join send_rollup s using (window_name)
  union all
  select 'OPS-012', 'Outbound delivery coverage', w.window_name, w.window_start, w.window_end,
    round(100.0 * d.leads_with_later_outbound / nullif(d.requested_leads, 0), 2), 'percent',
    d.leads_with_later_outbound, d.requested_leads, d.requested_leads, 'B',
    'requested lead references with a later outbound message / requested lead references * 100'
  from windows w join send_delivery_rollup d using (window_name)
  union all
  select 'OPS-013', 'First-touch response rate', w.window_name, w.window_start, w.window_end,
    round(100.0 * r.responded_leads / nullif(r.outbound_leads, 0), 2), 'percent',
    r.responded_leads, r.outbound_leads, r.outbound_leads, 'A',
    'leads with an inbound message after first outbound / leads first contacted in window * 100'
  from windows w join response_rollup r using (window_name)
  union all
  select 'OPS-017', 'Gross credit consumption', w.window_name, w.window_start, w.window_end,
    c.charged_credits, 'credits', c.charged_credits, null, null, 'A',
    'sum(usage_logs.cost where cost > 0 and timestamp in window)'
  from windows w join credit_rollup c using (window_name)
  union all
  select 'OPS-018', 'Search credit refund rate', w.window_name, w.window_start, w.window_end,
    round(100.0 * c.refunded_search_credits / nullif(c.charged_search_credits, 0), 2), 'percent',
    c.refunded_search_credits, c.charged_search_credits, null, 'A',
    'absolute refunded search credits / charged search credits in window * 100'
  from windows w join credit_rollup c using (window_name)
  union all
  select 'OPS-024', 'Signup volume', w.window_name, w.window_start, w.window_end,
    s.signups, 'users', s.signups, null, s.signups, 'A', 'count(auth.users created in window)'
  from windows w join signup_rollup s using (window_name)
  union all
  select 'OPS-019.' || c.action_name, 'Request correlation coverage: ' || c.action_name,
    w.window_name, w.window_start, w.window_end,
    round(100.0 * c.correlated_rows / nullif(c.charged_rows, 0), 2), 'percent',
    c.correlated_rows, c.charged_rows, c.charged_rows, 'B',
    'charged usage rows with request correlation key / charged usage rows for action * 100'
  from windows w join correlation_rollup c using (window_name)
)
select jsonb_build_object(
  'generated_at', (select as_of from clock),
  'metrics', coalesce(jsonb_agg(to_jsonb(metric_rows) order by metric_id, window_start), '[]'::jsonb)
)
from metric_rows;
