-- Current integrity snapshot and all-time ledger checks.
-- Findings are candidates for operational review, not confirmed incidents.
with
duplicate_correlations as (
  select action_name, correlation_key, count(*) as rows_for_key
  from (
    select action_name,
      case
        when action_name = 'FIND_LEAD' then metadata ->> 'search_id'
        when action_name = 'GENERATE_COPY' then metadata ->> 'copy_request_id'
        when action_name = 'SEND_MESSAGE' then metadata ->> 'send_request_id'
      end as correlation_key
    from public.usage_logs
    where (action_name = 'FIND_LEAD' and metadata ? 'search_id')
       or (action_name = 'GENERATE_COPY' and metadata ? 'copy_request_id')
       or (action_name = 'SEND_MESSAGE' and metadata ? 'send_request_id')
  ) correlations
  group by action_name, correlation_key
  having count(*) > 1
),
charge_formula_checks as (
  select count(*) as checked_rows,
    count(*) filter (
      where cost <> (metadata ->> 'quantity')::numeric * (metadata ->> 'unit_cost')::numeric
    ) as mismatched_rows
  from public.usage_logs
  where action_name in ('FIND_LEAD', 'GENERATE_COPY', 'SEND_MESSAGE')
    and (metadata ->> 'quantity') ~ '^[0-9]+([.][0-9]+)?$'
    and (metadata ->> 'unit_cost') ~ '^[0-9]+([.][0-9]+)?$'
),
refund_formula_checks as (
  select count(*) as checked_rows,
    count(*) filter (
      where abs(cost) <> (metadata ->> 'refunded_units')::numeric * (metadata ->> 'unit_cost')::numeric
    ) as mismatched_rows
  from public.usage_logs
  where action_name = 'FIND_LEAD_REFUND'
    and (metadata ->> 'refunded_units') ~ '^[0-9]+([.][0-9]+)?$'
    and (metadata ->> 'unit_cost') ~ '^[0-9]+([.][0-9]+)?$'
),
integrity_rows as (
  select 'OPS-020'::text as metric_id, 'Negative credit balances'::text as metric_name,
    count(*)::numeric as value, 'profiles'::text as unit, 'A'::text as confidence,
    'count(profiles where credits_balance < 0)'::text as formula
  from public.profiles where credits_balance < 0
  union all
  select 'OPS-021.searches', 'Stuck searches', count(*), 'searches', 'A snapshot', 'count(ops_stuck_searches)'
  from public.ops_stuck_searches
  union all
  select 'OPS-021.copy', 'Stuck copy requests', count(*), 'requests', 'A snapshot', 'count(ops_stuck_copy_requests)'
  from public.ops_stuck_copy_requests
  union all
  select 'OPS-021.leads', 'Stuck paid leads', count(*), 'leads', 'A snapshot', 'count(ops_stuck_leads)'
  from public.ops_stuck_leads
  union all
  select 'OPS-022.rows', 'Orphan charge rows', count(*), 'charges', 'B', 'count(ops_orphan_charges)'
  from public.ops_orphan_charges
  union all
  select 'OPS-022.credits', 'Orphan charged credits', coalesce(sum(cost), 0), 'credits', 'B', 'sum(ops_orphan_charges.cost)'
  from public.ops_orphan_charges
  union all
  select 'OPS-023.groups', 'Potential repeated-send groups', count(*), 'lead groups', 'B', 'count(ops_double_sends)'
  from public.ops_double_sends
  union all
  select 'OPS-023.excess', 'Potential excess send charges', coalesce(sum(cobrancas - 1), 0), 'charges', 'B', 'sum(ops_double_sends.cobrancas - 1)'
  from public.ops_double_sends
  union all
  select 'INT-001', 'Copy request missing lead references', count(*), 'references', 'B',
    'copy request lead references with no current lead row'
  from public.copy_requests c cross join lateral unnest(c.lead_ids) lead_id
  left join public.leads l on l.id = lead_id where l.id is null
  union all
  select 'INT-002', 'Send request missing lead references', count(*), 'references', 'B',
    'send request lead references with no current lead row'
  from public.send_requests r cross join lateral unnest(r.lead_ids) lead_id
  left join public.leads l on l.id = lead_id where l.id is null
  union all
  select 'INT-003', 'Cross-user request lead references', count(*), 'references', 'A',
    'copy and send request references whose lead owner differs from request owner'
  from (
    select 1 from public.copy_requests c cross join lateral unnest(c.lead_ids) lead_id join public.leads l on l.id = lead_id where l.user_id <> c.user_id
    union all
    select 1 from public.send_requests r cross join lateral unnest(r.lead_ids) lead_id join public.leads l on l.id = lead_id where l.user_id <> r.user_id
  ) cross_user
  union all
  select 'INT-004', 'Orphan messages', count(*), 'messages', 'A', 'messages whose lead row is absent'
  from public.messages m left join public.leads l on l.id = m.lead_id where l.id is null
  union all
  select 'INT-005', 'Duplicate correlated request keys', count(*), 'keys', 'B',
    'correlation keys appearing in more than one paid usage row'
  from duplicate_correlations
  union all
  select 'INT-006', 'Excess rows on duplicate correlation keys', coalesce(sum(rows_for_key - 1), 0), 'charges', 'B',
    'sum(rows per duplicate correlation key - 1)'
  from duplicate_correlations
  union all
  select 'INT-007', 'Charge formula mismatches', mismatched_rows, 'charges', 'A',
    'cost differs from metadata.quantity * metadata.unit_cost; checked=' || checked_rows
  from charge_formula_checks
  union all
  select 'INT-008', 'Refund formula mismatches', mismatched_rows, 'refunds', 'A',
    'abs(cost) differs from metadata.refunded_units * metadata.unit_cost; checked=' || checked_rows
  from refund_formula_checks
)
select jsonb_build_object(
  'generated_at', now(),
  'scope', 'current snapshot unless formula states ledger check',
  'metrics', coalesce(jsonb_agg(to_jsonb(integrity_rows) order by metric_id), '[]'::jsonb)
)
from integrity_rows;
