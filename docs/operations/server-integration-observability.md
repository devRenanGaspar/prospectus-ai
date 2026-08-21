# Server Integration Observability

Phase 3C instruments the trusted boundaries between the application, Supabase
Edge Functions, n8n and asynchronous delivery queues. All writes use the
service-role-only RPCs defined by the observability contract.

## Signals

| Boundary | Events | Correlation |
|---|---|---|
| `webhook-proxy` | `webhook.dispatched`, `webhook.completed`, `webhook.failed` | paid request UUID when available; otherwise a new technical dispatch UUID |
| `n8n-proxy` | `n8n.action_completed`, `n8n.action_failed` | validated correlation/request UUID returned by the workflow |
| Send queue polling | `queue.batch_claimed`, `queue.poll_failed` plus exact `send_requests` snapshot | aggregate only |
| Auth email enqueue | `email.delivery_queued`, `email.delivery_failed` | random email message UUID |
| Email processing | delivery started/completed/failed/deferred/deduplicated and batch lifecycle | validated email message UUID |

The webhook boundary adds `correlation_id` and `request_id` to the technical n8n
request envelope. Workflows should return the same `correlation_id` on calls to
`n8n-proxy`. Business payload fields remain unchanged.

## Error semantics

Telemetry and runtime logs contain stable codes only. Examples include
`UPSTREAM_TIMEOUT`, `UPSTREAM_HTTP_ERROR`, `UPSTREAM_INVALID_RESPONSE`,
`DATABASE_ERROR`, `EMAIL_PROVIDER_ERROR`, `RATE_LIMITED` and
`MAX_RETRIES_EXCEEDED`.

Raw exception messages, response bodies, URLs, email addresses, phone numbers,
message content and stack traces are never copied into operational events or
runtime logs. Existing application delivery records retain only stable error
codes for new provider failures.

## Queue semantics

The WhatsApp/send queue is represented by leads in `SEND_PENDING`. The polling
function queries its exact count and oldest `updated_at` in parallel with the
batch fetch, then records an aggregate `send_requests` snapshot. It does not
claim that the returned batch was removed from the queue; n8n changes each lead
state after delivery.

The email queues live in the internal `pgmq` schema. Current public RPCs can
claim a batch but cannot read exact total depth or oldest age. Phase 3C records
batch throughput, delivery outcomes and DLQ transitions, but deliberately does
not store batch size as queue depth. Exact `pgmq` snapshots require a separate,
service-role-only aggregate migration.

## Reliability

- Telemetry writes are best-effort; the shared helper catches RPC failures and
  emits only a stable local code.
- Event attributes are filtered again in the Edge runtime before the database
  constraint validates them.
- Only known webhook types, webhook actions and n8n actions are stored. Unknown
  values become `unknown` rather than free-form telemetry.
- Correlation and entity identifiers must be valid UUIDs.
- Email retries remain non-terminal in `operation_runs`; only success or DLQ
  exhaustion closes an email-delivery operation.

## Deployment boundary

Merging this code does not deploy the functions or enable production writes.
The observability migration must be applied before deploying the modified Edge
Functions. n8n workflows should then be updated to echo the technical
correlation ID, followed by a sanitized smoke test.
