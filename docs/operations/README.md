# Operations

Public, sanitized documentation for how Prospectus is observed and operated.
It must never contain production exports, customer data, real commercial
volumes, internal URLs, tokens or incident evidence.

## What is here

- [`observability-event-contract.md`](observability-event-contract.md) — the
  server-side event schema, its privacy rules and the lifecycle-capture
  triggers, asserted in CI by `supabase/tests/phase3_observability_contract.sql`.
- [`frontend-observability.md`](frontend-observability.md) — the browser
  collector, its consent gate and its authenticated ingestion boundary.
- [`server-integration-observability.md`](server-integration-observability.md) —
  correlation across webhook/n8n events and asynchronous delivery signals.
- [`../../scripts/observability/`](../../scripts/observability/) — read-only
  aggregate queries. Real aggregate values are reviewed privately and are not
  committed here.

## Admin operations console

The console is at `/admin/system-health`. It reads a single PII-free aggregate
from `get_admin_system_health()`, refreshes every 60 seconds and separates
observed zeroes from signals that are not instrumented. It covers operational
telemetry, stuck paid operations, correlated operation state and any available
queue snapshots. Synthetic availability and database capacity remain explicit
gaps rather than being reported as healthy.

## Historical operational baseline

The system persists a PII-free health snapshot every five minutes in
`system_health_snapshots`. Detailed points are retained for 90 days and hourly
rollups in `system_health_hourly` for 730 days. The admin console compares the
live value with the median and p10–p90 range for the same hour of day over the
previous 28 days. It requires at least 36 equivalent samples before presenting
the comparison as ready; until then the UI reports that history is still being
collected. Collection and rollup jobs are managed through `pg_cron`.

## Copy quality grounding

`ops_copy_quality` and `copy_quality_daily` check whether AI-generated cold
outreach copy (`GENERATE_COPY`, the largest single share of credits spent)
actually matches the lead's own data — review count, Google rating, and
site/Instagram presence. A daily `pg_cron` job (`capture-copy-quality-daily`,
06:00 UTC) captures the snapshot and emails admins only on a real regression
against the check's own history, not on the already-known chronic backlog.
Current status is surfaced in the "Grounding da copy fria" section of
`/admin/system-health`, via the admin-only RPC `get_admin_copy_quality()`.
