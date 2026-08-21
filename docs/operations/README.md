# Operational Baseline

This directory contains public, sanitized definitions for the Prospectus
operational baseline. It must never contain production exports, customer data,
real commercial volumes, internal URLs, tokens or incident evidence.

## Confidence classes

- **A — historical:** the source has a stable definition, reliable timestamps
  and sufficient historical coverage for the intended metric.
- **B — partial:** useful history exists, but coverage, correlation or semantics
  limit the result.
- **C — forward-only:** no reliable historical series exists; collection begins
  after explicit instrumentation or platform access is configured.

The source catalog, preliminary metric catalog and gap matrix are Phase 1
deliverables. Real aggregate values are reviewed privately and are not committed
to this public repository.

The Phase 1 metric definitions and interpretation rules were approved at the
2026-08-05 checkpoint. Numerical targets and alert thresholds remain deferred to
the historical baseline and calibration phases.

Phase 2 adds the sanitized methodology in `baseline-operational-v1.md` and the
reproducible aggregate queries under `scripts/observability/`. The report with
real production values remains private and gitignored.

Phase 3 begins with the server-side schema and privacy rules documented in
`observability-event-contract.md`. Application and integration instrumentation
are delivered in separate pull requests after this contract is approved.

The browser collector and its authenticated ingestion boundary are documented
in `frontend-observability.md`. They add forward-only Core Web Vitals, sanitized
JavaScript error and navigation signals; merging the code does not deploy the
Edge Function or enable production collection.

Server-side correlation, webhook/n8n events and asynchronous delivery signals
are documented in `server-integration-observability.md`. Exact email queue depth
remains an explicit migration gap because current Edge Functions cannot inspect
the internal `pgmq` metrics safely.

## Admin operations console v0

The first console block is available at `/admin/system-health`. It reads a
single PII-free aggregate from `get_admin_system_health()`, refreshes every 60
seconds and separates observed zeroes from signals that are not instrumented.
It currently covers operational telemetry, stuck paid operations, correlated
operation state and any available queue snapshots. Synthetic availability and
database capacity remain explicit gaps rather than being reported as healthy.

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

This is a separate initiative from the Phase 1–3 operational baseline
described above — it was not delivered under that phase gate, and the
"Phase boundary" note below does not describe it. It reuses the same shape
(`pg_cron`, a snapshot table, an admin-only RPC) for consistency with the
rest of this directory, not because it is part of that rollout.

## Agent architecture baseline

`prospectus-agent-architecture.md` documents, with fidelity and without
proposing fixes, how the WhatsApp SDR agent and its surrounding n8n workflows
actually behave today — the conversation loop, tool calls, retrieval (or lack
of it), retries, locks and error paths. Gaps found while reading it are kept
separate in `prospectus-agent-architecture-gaps.md`. Both are reconstructed
from the n8n workflow definitions plus this repository's contract; neither
reproduces secrets, internal URLs or customer data. They are kept local and
gitignored anyway (`docs/operations/prospectus-*.md`), for a different reason
than the pair below: the gaps file is a running list of this system's still-open
defects, and publishing a map of what is currently broken is not something this
repository does while the defects are still open. Resolved gaps stay in the
file, marked resolved with the fix — they are not deleted or moved out — so it
also serves as a record of what has already been closed. Findings that carry
their own security or availability weight get a separate, public entry in
`docs/security-risk-register.md` as well; the two are cross-referenced rather
than one replacing the other.

`prospectus-data-inventory.md` and `prospectus-data-inventory-gaps.md` go a
level deeper: for the WhatsApp agent flow, they classify every relevant piece
of data by whether it is persisted, queryable, temporary or not recorded at
all, inventory the correlation IDs (and their absence), and reconstruct two
real n8n executions end to end to test what can and cannot be recovered
after the fact. Because that reconstruction necessarily touches real (if
redacted) tenant and lead data, both files are kept local and gitignored
rather than committed.

## Phase boundary

Phase 1 is read-only. These documents and the queries under
`scripts/observability/` do not authorize schema changes, application
instrumentation, alert creation or production writes. This boundary scopes
the Phase 1–3 operational baseline described above; it does not apply to
unrelated schema or instrumentation work such as copy quality grounding.
