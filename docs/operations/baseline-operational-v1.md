# Baseline Operational v1

This document defines the reproducible Phase 2 baseline contract. Production
values are intentionally absent because this repository is public. The private
report generated from these definitions records value, period, formula, sample
size and confidence.

The Phase 2 checkpoint, including the historical-latency and outbound-delivery
confidence refinements, was approved on 2026-08-05.

## Windows

All rolling windows are half-open (`window_start <= event < window_end`) and use
the database clock as the shared `window_end`.

| Window | Definition |
|---|---|
| Complete | Earliest useful core event through execution time |
| Last 90 days | Execution time minus 90 days through execution time |
| Last 30 days | Execution time minus 30 days through execution time |
| Last 7 days | Execution time minus 7 days through execution time |
| Weekly comparison | Current rolling 7 days versus previous rolling 7 days |
| Monthly comparison | Current rolling 30 days versus previous rolling 30 days |

Calendar-week and calendar-month series are also returned for trend analysis.

## Reproducible outputs

| Query | Output |
|---|---|
| `phase2_window_metrics.sql` | Volume, success, failure, refunds, conversion proxies, credits, signups and request-correlation coverage |
| `phase2_latency_percentiles.sql` | p50, p95 and p99, sample size, timestamp coverage and confidence |
| `phase2_period_comparisons.sql` | Weekly/monthly current value, previous value, absolute/relative change and calendar series |
| `phase2_integrity_snapshot.sql` | Credit formula checks, duplicate correlation keys and current operational-integrity detections |

Each file is a single aggregate-only PostgreSQL `SELECT`. Outputs contain no
row identifiers, customer attributes, message contents, tokens or URLs.

## Interpretation rules

- Operation cohorts use request creation time.
- Search/copy/send success and failure use durable request status.
- Send completion status does not prove provider delivery. That requires the
  correlation ledger proposed for Phase 3.
- First-touch response rate cohorts a lead by its first outbound message and
  looks for the first later inbound message.
- Outbound delivery coverage is Class B because messages do not carry a durable
  send-request correlation identifier.
- Gross credit consumption sums positive ledger costs. Search credit refund rate
  divides the absolute refund value by positive search charges in the same
  window.
- Repeat sends remain review candidates, not confirmed duplicates, unless a
  matching correlation and time-window rule is available.

## Latency quality

The June 2026 completion-timestamp migration backfilled some historical terminal
rows with `completed_at = created_at`. Phase 2 therefore excludes non-positive
durations from percentile samples and reports their coverage separately.

- Search and copy latency are Class A only for recent windows with at least 95%
  timestamp coverage; older windows remain Class B.
- Send latency remains Class B while recent `completed_at` coverage is absent.
- First-response latency is derived from durable message timestamps and remains
  Class A for the approved first-touch definition.

## Confidence and privacy

Class A is suitable for direct historical comparison under the documented
formula. Class B is useful only with the stated coverage or semantic limitation.
Class C still requires new instrumentation and therefore has no fabricated
historical value in Baseline v1.

Real values and findings must remain in a private/admin-only report. They must
not be copied into this repository, public Issues or public pull requests.
