-- Duration percentiles by approved rolling window.
-- Zero-duration legacy backfills are excluded from percentile samples.
with
clock as (
  select now() as as_of
),
source_start as (
  select min(first_at) as first_at
  from (
    select min(created_at) as first_at from public.lead_searches
    union all select min(created_at) from public.copy_requests
    union all select min(created_at) from public.send_requests
    union all select min("timestamp") from public.messages
  ) starts
),
windows as (
  select 'complete'::text as window_name, source_start.first_at as window_start, clock.as_of as window_end
  from source_start cross join clock
  union all select 'last_90d', clock.as_of - interval '90 days', clock.as_of from clock
  union all select 'last_30d', clock.as_of - interval '30 days', clock.as_of from clock
  union all select 'last_7d', clock.as_of - interval '7 days', clock.as_of from clock
),
operation_durations as (
  select 'OPS-003'::text as metric_id, 'Search latency'::text as metric_name,
    'search'::text as operation, created_at as cohort_at, status, completed_at,
    extract(epoch from completed_at - created_at)::numeric as duration_seconds
  from public.lead_searches
  union all
  select 'OPS-008', 'Copy latency', 'copy', created_at, status, completed_at,
    extract(epoch from completed_at - created_at)::numeric
  from public.copy_requests
  union all
  select 'OPS-011', 'Send latency', 'send', created_at, status, completed_at,
    extract(epoch from completed_at - created_at)::numeric
  from public.send_requests
),
operation_rollup as (
  select
    d.metric_id,
    d.metric_name,
    d.operation,
    w.window_name,
    w.window_start,
    w.window_end,
    count(d.*) filter (where d.status in ('completed', 'failed')) as terminal_rows,
    count(d.completed_at) filter (where d.status in ('completed', 'failed')) as timestamped_rows,
    count(*) filter (where d.status in ('completed', 'failed') and d.duration_seconds > 0) as percentile_sample,
    round((percentile_cont(0.50) within group (order by d.duration_seconds)
      filter (where d.status in ('completed', 'failed') and d.duration_seconds > 0))::numeric, 2) as p50_seconds,
    round((percentile_cont(0.95) within group (order by d.duration_seconds)
      filter (where d.status in ('completed', 'failed') and d.duration_seconds > 0))::numeric, 2) as p95_seconds,
    round((percentile_cont(0.99) within group (order by d.duration_seconds)
      filter (where d.status in ('completed', 'failed') and d.duration_seconds > 0))::numeric, 2) as p99_seconds
  from windows w
  left join operation_durations d
    on d.cohort_at >= w.window_start and d.cohort_at < w.window_end
  group by d.metric_id, d.metric_name, d.operation, w.window_name, w.window_start, w.window_end
),
first_outbound as (
  select lead_id, min("timestamp") as first_outbound_at
  from public.messages
  where upper(sender) in ('AI', 'USER')
  group by lead_id
),
response_durations as (
  select
    o.lead_id,
    o.first_outbound_at as cohort_at,
    extract(epoch from min(m."timestamp") - o.first_outbound_at)::numeric as duration_seconds
  from first_outbound o
  join public.messages m
    on m.lead_id = o.lead_id
   and upper(m.sender) = 'LEAD'
   and m."timestamp" > o.first_outbound_at
  group by o.lead_id, o.first_outbound_at
),
response_rollup as (
  select
    'OPS-014'::text as metric_id,
    'Time to first response'::text as metric_name,
    'first_response'::text as operation,
    w.window_name,
    w.window_start,
    w.window_end,
    count(r.*) as terminal_rows,
    count(r.*) as timestamped_rows,
    count(r.*) filter (where r.duration_seconds > 0) as percentile_sample,
    round((percentile_cont(0.50) within group (order by r.duration_seconds)
      filter (where r.duration_seconds > 0))::numeric, 2) as p50_seconds,
    round((percentile_cont(0.95) within group (order by r.duration_seconds)
      filter (where r.duration_seconds > 0))::numeric, 2) as p95_seconds,
    round((percentile_cont(0.99) within group (order by r.duration_seconds)
      filter (where r.duration_seconds > 0))::numeric, 2) as p99_seconds
  from windows w
  left join response_durations r
    on r.cohort_at >= w.window_start and r.cohort_at < w.window_end
  group by w.window_name, w.window_start, w.window_end
),
all_rollups as (
  select * from operation_rollup where metric_id is not null
  union all select * from response_rollup
)
select jsonb_build_object(
  'generated_at', (select as_of from clock),
  'latencies', coalesce(jsonb_agg(
    jsonb_build_object(
      'metric_id', metric_id,
      'metric_name', metric_name,
      'operation', operation,
      'window_name', window_name,
      'window_start', window_start,
      'window_end', window_end,
      'terminal_rows', terminal_rows,
      'timestamped_rows', timestamped_rows,
      'timestamp_coverage_pct', round(100.0 * timestamped_rows / nullif(terminal_rows, 0), 2),
      'percentile_sample', percentile_sample,
      'p50_seconds', p50_seconds,
      'p95_seconds', p95_seconds,
      'p99_seconds', p99_seconds,
      'confidence', case
        when operation = 'first_response' then 'A'
        when operation = 'send' then 'B'
        when window_start >= timestamptz '2026-06-11 00:00:00+00'
         and 1.0 * timestamped_rows / nullif(terminal_rows, 0) >= 0.95 then 'A'
        else 'B'
      end,
      'formula', case
        when operation = 'first_response' then 'first inbound timestamp - first outbound timestamp per lead'
        else 'completed_at - created_at for terminal rows with positive observed duration'
      end
    ) order by metric_id, window_start
  ), '[]'::jsonb)
)
from all_rollups;
