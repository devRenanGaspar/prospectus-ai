# Phase 1 Gap Matrix

## Class A — ready for historical baseline

- Search volume, completion and refunds.
- Copy volume and completion.
- Recent search/copy latency where observed timestamps have at least 95%
  coverage.
- Send volume and completion status.
- First-touch response rate and first-response time.
- Credit volume/refunds by action.
- Current lead funnel, credit balances and current integration state.
- Signup cohorts.
- Current operational-view snapshots.

## Class B — usable with explicit limitations

- Search delivery ratio: historical deletions and reserve movement can create
  differences between recorded and currently linked leads.
- Historical search/copy latency: pre-instrumentation terminal timestamps were
  backfilled, so full-period percentiles exclude zero-duration rows and remain
  partial.
- Send latency: completion timestamps are only partially populated and stop
  being useful in recent cohorts.
- Outbound delivery coverage: a later message is linked to the lead but not to a
  durable send-request correlation identifier.
- Request-level credit reconciliation: correlation metadata was introduced
  incrementally and does not cover the entire history.
- Historical funnel transitions: only current status is durable; request and
  message tables provide proxies, not a complete transition ledger.
- WhatsApp and subscription events: their ledgers begin after initial
  production activity.
- Onboarding completion: field adoption history is unknown.
- Email delivery: raw rows represent lifecycle states and the recent continuity
  of the source needs validation.
- Duplicate message/send signals: identifiers and repeat-send business rules
  require semantic validation before alerting.

## Class C — starts after instrumentation or access

- Real-user Core Web Vitals and route performance.
- Frontend JavaScript errors and affected sessions.
- Synthetic availability.
- Historical Edge Function success and latency beyond platform retention.
- End-to-end n8n success, latency and correlation.
- Queue backlog and oldest-item age.
- Historical database CPU, memory, disk, pool and slow-query series.
- Historical DAU/WAU/MAU event series.
- Lead-status transition history.
- Trend history for operational integrity views and Supabase advisors.
- Long-term CI/deployment/change-failure metrics before the clean public
  history.

## Access gaps

- Supabase project plan and exact Logs Explorer boundary require administrator
  dashboard access for the production project.
- Cloudflare dashboard access is required to confirm whether any account-side
  Web Analytics dataset predates the current deployment.
- n8n execution history requires access to the privately operated n8n instance
  or a sanitized export/metrics endpoint.
