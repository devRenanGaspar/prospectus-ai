# Observability Event Contract

This Phase 3 contract defines privacy-safe telemetry shared by the frontend,
Supabase Edge Functions, database lifecycle triggers and n8n boundaries.

## Correlation

- `correlation_id` is the stable end-to-end identifier.
- Paid search, copy and send flows initially reuse their request UUID as the
  correlation UUID.
- `request_id` identifies the durable request row when one exists.
- `session_id` is a random browser-session UUID. It is not an auth user ID.
- `entity_id` may contain a technical lead/request UUID, but never a customer
  attribute.

The event table deliberately has no user ID, email, phone, name, message body,
raw URL, webhook URL, exception message or stack-trace column.

## Tables

| Table | Contract |
|---|---|
| `operational_events` | Append-only structured events with idempotent `event_id`, optional correlation and allowlisted scalar attributes |
| `operation_runs` | Current state and timestamps for critical correlated operations |
| `queue_metric_snapshots` | Aggregate queue depth, oldest age, processing and failure counts without queue payloads |

All three tables use RLS. Authenticated administrators may read them; browser
users cannot insert or update telemetry directly. Only server-side service-role
code can call the ingestion functions.

## Event naming

Event names use lowercase dotted identifiers, for example:

- `frontend.web_vital`
- `frontend.javascript_error`
- `webhook.dispatched`
- `webhook.completed`
- `webhook.failed`
- `operation.requested`
- `operation.status_changed`
- `lead.status_changed`
- `queue.snapshot`

`error_code` contains a stable uppercase machine code such as
`UPSTREAM_TIMEOUT`; it must never contain the original exception text.

`route_key`, operation types and queue names are database allowlists rather than
free-form strings. Dynamic route parameters are replaced by templates such as
`/leads/:leadId`, preventing identifiers and query strings from entering the
telemetry store.

## Allowed attributes

`attributes` is limited to 2 KiB, scalar values and this allowlist:

`action`, `attempt`, `batch_size`, `build`, `connection_type`, `http_status`,
`metric`, `navigation_type`, `oldest_age_seconds`, `operation_stage`, `provider`,
`queue_depth`, `queue_name`, `rating`, `release`, `result_count`, `sample_rate`,
`status_from`, `status_to`, `visibility_state`.

Keys such as `email`, `phone`, `name`, `message`, `content`, `url`, `payload`,
`error`, `stack` and `token` fail the database constraint.

## Database lifecycle behavior

- Future lead status changes automatically emit `lead.status_changed`.
- Paid lead transitions resolve the latest matching copy/send request when no
  explicit correlation context is present.
- Future search/copy request changes synchronize `operation_runs` through their
  terminal database status.
- A completed send request means the batch was accepted into the queue, so its
  operation run remains `queued`; a later Edge/n8n event must confirm delivery.
- No historical rows are backfilled by the migration.

## Views

- `ops_event_metrics_hourly` aggregates event volume, errors and durations.
- `ops_operation_health` aggregates current operation state and durations.
- `ops_queue_latest` returns the most recent aggregate snapshot per queue.

The views use invoker security and inherit the administrator-only base-table
access rules.

## Testing

`supabase/tests/phase3_observability_contract.sql` validates schema presence,
RLS, grants, attribute privacy, event idempotency, unsafe input rejection and
operation-run terminal transitions. It must run only after migrations in an
isolated/local Supabase database; the test transaction rolls back.

## Frontend ingestion

The browser cannot execute the service-role ingestion RPC. Phase 3B therefore
uses the `frontend-telemetry` Edge Function as an authenticated, fail-closed
boundary. It validates a smaller event-specific allowlist before calling
`record_operational_event`; the authenticated user ID is used only for request
authorization and is never stored with telemetry.

See `frontend-observability.md` for signal semantics, limits and deployment
configuration.

## Server integration instrumentation

The shared Edge helper filters attributes, validates UUID correlation IDs and
converts runtime failures to stable codes before invoking the service-role RPCs.
Webhook dispatches carry their technical correlation ID into n8n, and callback
events can reuse it without persisting business payloads.

See `server-integration-observability.md` for integration events, email retry
semantics and the remaining exact-depth gap for internal `pgmq` queues.
