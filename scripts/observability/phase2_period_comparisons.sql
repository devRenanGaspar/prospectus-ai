-- Rolling week/month comparisons plus calendar week/month aggregate series.
with
clock as (
  select now() as as_of
),
comparison_periods as (
  select 'week'::text as cadence, 'current'::text as period_role,
    clock.as_of - interval '7 days' as period_start, clock.as_of as period_end from clock
  union all select 'week', 'previous', clock.as_of - interval '14 days', clock.as_of - interval '7 days' from clock
  union all select 'month', 'current', clock.as_of - interval '30 days', clock.as_of from clock
  union all select 'month', 'previous', clock.as_of - interval '60 days', clock.as_of - interval '30 days' from clock
),
period_metrics as (
  select p.*, 'OPS-001'::text as metric_id, 'Search request volume'::text as metric_name,
    count(s.*)::numeric as metric_value, 'requests'::text as unit
  from comparison_periods p left join public.lead_searches s on s.created_at >= p.period_start and s.created_at < p.period_end
  group by p.cadence, p.period_role, p.period_start, p.period_end
  union all
  select p.*, 'OPS-002', 'Search completion rate',
    round(100.0 * count(*) filter (where s.status = 'completed') / nullif(count(s.*), 0), 2), 'percent'
  from comparison_periods p left join public.lead_searches s on s.created_at >= p.period_start and s.created_at < p.period_end
  group by p.cadence, p.period_role, p.period_start, p.period_end
  union all
  select p.*, 'OPS-006', 'Copy request volume', count(c.*), 'requests'
  from comparison_periods p left join public.copy_requests c on c.created_at >= p.period_start and c.created_at < p.period_end
  group by p.cadence, p.period_role, p.period_start, p.period_end
  union all
  select p.*, 'OPS-007', 'Copy completion rate',
    round(100.0 * count(*) filter (where c.status = 'completed') / nullif(count(c.*), 0), 2), 'percent'
  from comparison_periods p left join public.copy_requests c on c.created_at >= p.period_start and c.created_at < p.period_end
  group by p.cadence, p.period_role, p.period_start, p.period_end
  union all
  select p.*, 'OPS-009', 'Send request volume', count(r.*), 'requests'
  from comparison_periods p left join public.send_requests r on r.created_at >= p.period_start and r.created_at < p.period_end
  group by p.cadence, p.period_role, p.period_start, p.period_end
  union all
  select p.*, 'OPS-010', 'Send completion rate',
    round(100.0 * count(*) filter (where r.status = 'completed') / nullif(count(r.*), 0), 2), 'percent'
  from comparison_periods p left join public.send_requests r on r.created_at >= p.period_start and r.created_at < p.period_end
  group by p.cadence, p.period_role, p.period_start, p.period_end
  union all
  select p.*, 'OPS-017', 'Gross credit consumption', coalesce(sum(u.cost) filter (where u.cost > 0), 0), 'credits'
  from comparison_periods p left join public.usage_logs u on u."timestamp" >= p.period_start and u."timestamp" < p.period_end
  group by p.cadence, p.period_role, p.period_start, p.period_end
  union all
  select p.*, 'OPS-024', 'Signup volume', count(u.*), 'users'
  from comparison_periods p left join auth.users u on u.created_at >= p.period_start and u.created_at < p.period_end
  group by p.cadence, p.period_role, p.period_start, p.period_end
),
comparisons as (
  select
    current.cadence,
    current.metric_id,
    current.metric_name,
    current.unit,
    current.period_start as current_start,
    current.period_end as current_end,
    previous.period_start as previous_start,
    previous.period_end as previous_end,
    current.metric_value as current_value,
    previous.metric_value as previous_value,
    current.metric_value - previous.metric_value as absolute_change,
    round(100.0 * (current.metric_value - previous.metric_value) / nullif(previous.metric_value, 0), 2) as relative_change_pct
  from period_metrics current
  join period_metrics previous
    on previous.cadence = current.cadence
   and previous.metric_id = current.metric_id
   and previous.period_role = 'previous'
  where current.period_role = 'current'
),
metric_events as (
  select 'OPS-001'::text as metric_id, 'Search request volume'::text as metric_name, created_at as event_at, 1::numeric as value from public.lead_searches
  union all select 'OPS-006', 'Copy request volume', created_at, 1 from public.copy_requests
  union all select 'OPS-009', 'Send request volume', created_at, 1 from public.send_requests
  union all select 'OPS-013.outbound', 'Outbound message volume', "timestamp", 1 from public.messages where upper(sender) in ('AI', 'USER')
  union all select 'OPS-013.inbound', 'Inbound message volume', "timestamp", 1 from public.messages where upper(sender) = 'LEAD'
  union all select 'OPS-017', 'Gross credit consumption', "timestamp", cost::numeric from public.usage_logs where cost > 0
  union all select 'OPS-024', 'Signup volume', created_at, 1 from auth.users
),
series as (
  select 'week'::text as cadence, metric_id, metric_name,
    date_trunc('week', event_at) as period_start, sum(value) as metric_value
  from metric_events
  group by metric_id, metric_name, date_trunc('week', event_at)
  union all
  select 'month', metric_id, metric_name,
    date_trunc('month', event_at), sum(value)
  from metric_events
  group by metric_id, metric_name, date_trunc('month', event_at)
)
select jsonb_build_object(
  'generated_at', (select as_of from clock),
  'comparisons', (select coalesce(jsonb_agg(to_jsonb(comparisons) order by cadence, metric_id), '[]'::jsonb) from comparisons),
  'series', (select coalesce(jsonb_agg(to_jsonb(series) order by cadence, metric_id, period_start), '[]'::jsonb) from series)
);
