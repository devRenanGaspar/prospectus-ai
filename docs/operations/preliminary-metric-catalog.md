# Preliminary Operational Metric Catalog

The formulas below were approved at the Phase 1 checkpoint. Targets and alert
thresholds are intentionally deferred until the historical baseline is
calculated.

## Approved Phase 1 semantics

The Phase 1 checkpoint was approved on 2026-08-05 with these interpretation
rules:

1. Repeated sends to the same lead are not duplicates by default; a duplicate
   requires matching correlation evidence and an approved time window.
2. `mensagem_abordagem_comercial` is the canonical generated-copy field;
   `ai_generated_copy` is legacy.
3. Send success is derived from request status. `completed_at` is used only for
   latency metrics when present.
4. Delivery differences potentially caused by lead deletion or reserve movement
   remain Class B until those flows have durable event evidence.
5. `external_message_id` is not a standalone deduplication key until its provider
   scope is documented.

| ID | Metric | Formula | Source | Class |
|---|---|---|---|---|
| OPS-001 | Search request volume | count of `lead_searches` by request creation window | `lead_searches` | A |
| OPS-002 | Search completion rate | completed searches / searches created in cohort | `lead_searches` | A |
| OPS-003 | Search latency | p50/p95/p99 of `completed_at - created_at` | `lead_searches` | B full/90d; A recent |
| OPS-004 | Search refund rate | searches with `refunded_at` / searches created | `lead_searches` | A |
| OPS-005 | Search delivery ratio | leads linked to search / quantity requested | `lead_searches`, `leads` | B |
| OPS-006 | Copy request volume | count of requests by creation window | `copy_requests` | A |
| OPS-007 | Copy completion rate | completed requests / requests created in cohort | `copy_requests` | A |
| OPS-008 | Copy latency | p50/p95/p99 of `completed_at - created_at` | `copy_requests` | B full/90d; A recent |
| OPS-009 | Send request volume | count of requests by creation window | `send_requests` | A |
| OPS-010 | Send completion rate | completed requests / requests created in cohort | `send_requests` | A |
| OPS-011 | Send latency | p50/p95/p99 of `completed_at - created_at` | `send_requests` | B |
| OPS-012 | Outbound delivery coverage | leads with outbound message / leads requested for send | `messages`, `send_requests` | B |
| OPS-013 | Response rate | leads with inbound message / leads with outbound message | `messages` | A |
| OPS-014 | Time to first response | first inbound timestamp minus first outbound timestamp per lead | `messages` | A |
| OPS-015 | Current funnel distribution | leads grouped by current status | `leads` | A |
| OPS-016 | Historical funnel conversion | cohort transitions between lead states | current state plus request/message proxies | B |
| OPS-017 | Credit consumption | sum of cost by action and time window | `usage_logs` | A |
| OPS-018 | Credit refund rate | refund cost / charged search cost by cohort | `usage_logs`, `lead_searches` | A |
| OPS-019 | Request-level credit reconciliation | correlated usage rows / paid requests | `usage_logs`, request tables | B |
| OPS-020 | Negative credit balances | profiles where balance is below zero | `profiles` | A |
| OPS-021 | Stuck paid operations | current count and oldest age in operational views | `ops_stuck_*` | A snapshot / C trend |
| OPS-022 | Orphan charges | current correlated orphan charge count | `ops_orphan_charges` | B |
| OPS-023 | Potential duplicate sends | leads with repeated send charges | `ops_double_sends` | B |
| OPS-024 | Signup volume | users created by cohort | `auth.users` | A |
| OPS-025 | DAU/WAU/MAU | distinct authenticated users with activity in window | Auth activity events | C |
| OPS-026 | Onboarding completion rate | completed onboarding / eligible profiles | `profiles` | B |
| OPS-027 | WhatsApp active rate | active profiles / eligible profiles | `profiles` | A snapshot |
| OPS-028 | WhatsApp disconnect rate | disconnect events / connected population and window | `whatsapp_connection_events` | B |
| OPS-029 | Subscription renewal success | applied renewals / renewal events | `subscription_events` | B |
| OPS-030 | Email delivery success | terminal sent messages / queued message IDs | `email_send_log` | B |
| OPS-031 | Frontend availability | successful synthetic probes / total probes | new synthetic monitor | C |
| OPS-032 | Core Web Vitals | p75 LCP, INP and CLS by route/device | new browser telemetry | C |
| OPS-033 | Frontend error-session rate | sessions with uncaught error / observed sessions | new error telemetry | C |
| OPS-034 | Edge Function error rate | non-success invocations / invocations by function | Supabase invocation logs | C historical |
| OPS-035 | Edge Function latency | p50/p95/p99 invocation duration by function | Supabase invocation logs | C historical |
| OPS-036 | n8n end-to-end success | successful callbacks / accepted requests | new correlation ledger | C |
| OPS-037 | n8n end-to-end latency | callback timestamp minus accepted timestamp | new correlation ledger | C |
| OPS-038 | Queue backlog and oldest age | visible items and age of oldest unprocessed item | queue metrics | C |
| OPS-039 | Database saturation | CPU, memory, connections, pool and disk utilization | Supabase platform metrics | C historical |
| OPS-040 | Slow-query rate | queries above approved duration / query volume | Postgres telemetry | C historical |
| OPS-041 | CI success rate | successful CI runs / completed CI runs | GitHub Actions | C, collection starts now |
| OPS-042 | Deployment success rate | successful production deployments / attempts | GitHub and Cloudflare | C, collection starts now |
| OPS-043 | Change failure and recovery | production failures and time to recovery | deploy and incident records | C |
| OPS-044 | Advisor trend | findings by severity over time | Supabase advisors snapshots | C |
