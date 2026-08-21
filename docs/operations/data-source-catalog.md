# Operational Data Source Catalog

This catalog records the usable contract of each source without publishing
production values. Exact row counts and date boundaries are kept in the private
Phase 1 checkpoint.

## Product and workflow sources

| Source | Purpose | Useful time fields | Historical assessment |
|---|---|---|---|
| `auth.users` | Account creation and latest sign-in snapshot | `created_at`, `last_sign_in_at` | Signups A; activity trend B |
| `auth.sessions` | Current/recent sessions | `created_at`, `updated_at`, `refreshed_at` | C for historical activity |
| `auth.audit_log_entries` | Auth audit events | `created_at` | C; no useful history observed |
| `profiles` | Current role, plan, credits, onboarding and integration state | `created_at`, `google_calendar_connected_at` | A for current state; B for state history |
| `lead_searches` | Search requests, completion, delivery and refunds | `created_at`, `completed_at`, `refunded_at` | A except delivery reconciliation |
| `leads` | Current lead state and search association | `created_at`, `updated_at`, `last_message_at` | A for current state; B for historical funnel transitions |
| `copy_requests` | Paid copy-generation requests | `created_at`, `completed_at` | A |
| `send_requests` | Paid message-send requests | `created_at`, `completed_at` | A for volume/status; B for latency |
| `messages` | Inbound and outbound conversation events | `timestamp` | A for linked message flow; external ID semantics B |
| `usage_logs` | Credit consumption and refunds | `timestamp` | A by action; request correlation B |
| `whatsapp_connection_events` | WhatsApp connection transitions | `created_at` | B; event history starts after initial production data |
| `subscriptions` | Current subscription state | `created_at`, period boundaries | A for current state; B for lifecycle history |
| `subscription_events` | Renewal/idempotency ledger | `created_at`, `updated_at`, period boundaries | A since introduction; B for project lifetime |
| `email_send_log` | Email queue lifecycle | `created_at` | B; terminal-event semantics and continuity need validation |
| `lead_comments` | Comment activity | `created_at` | A for activity volume |

## Operational integrity views

| Source | Detection contract | Limitation |
|---|---|---|
| `ops_stuck_searches` | Search pending or processing beyond 30 minutes | Snapshot only; no historical count series |
| `ops_stuck_copy_requests` | Copy processing beyond 15 minutes | Snapshot only |
| `ops_orphan_charges` | Correlated charge whose request no longer exists | Depends on correlation metadata |
| `ops_double_sends` | Lead charged more than once for send | Repeated sends may require business-semantic validation |
| `ops_stuck_leads` | Paid lead state older than one hour | Snapshot only; reason is not recorded |

## Platform sources

| Platform source | Available signal | Retention/coverage |
|---|---|---|
| Supabase Logs Explorer | API, Postgres, Auth, Realtime and Edge Function logs | Plan-dependent; exact project plan requires dashboard access |
| Edge Function invocation logs | Status and execution duration | Limited to Supabase log retention |
| Cloudflare Pages checks | Build/deploy result | Available through GitHub checks from the clean public history onward |
| Cloudflare Web Analytics | Page views and Core Web Vitals | Beacon not observed in production; treat as forward-only until dashboard confirmation |
| GitHub Actions | CI, CodeQL and dependency workflow runs | Repository setting retains logs/artifacts for 90 days |

## Missing event contracts

- There is no persistent lead-status transition ledger.
- There is no persistent end-to-end webhook execution ledger.
- There is no frontend error or Core Web Vitals event stream.
- There is no historical snapshot series for the five operational views.
- There is no durable database-capacity time series in the application schema.
