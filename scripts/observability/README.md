# Observability Audit Queries

These scripts are Phase 1, aggregate-only PostgreSQL `SELECT` statements.
They must be executed with a securely supplied database URL and their real
output must not be committed to this public repository.

- `phase1_schema_inventory.sql` inventories relations and candidate timestamp,
  event and state columns.
- `phase1_data_profile.sql` measures source windows, field coverage, links and
  integrity candidates without returning identifiers or PII.
- `phase1_journey_audit.sql` profiles critical-journey coverage and correlation
  gaps.
- `phase2_window_metrics.sql` calculates approved metrics for complete, 90-day,
  30-day and 7-day windows.
- `phase2_latency_percentiles.sql` calculates p50, p95 and p99 with timestamp
  coverage and confidence.
- `phase2_period_comparisons.sql` produces rolling weekly/monthly comparisons
  and calendar period series.
- `phase2_integrity_snapshot.sql` calculates current operational-integrity and
  all-time credit-ledger checks.

Review every query before execution. A future change that writes data, calls a
mutating function or returns row-level attributes is outside this directory's
Phase 1 contract.
