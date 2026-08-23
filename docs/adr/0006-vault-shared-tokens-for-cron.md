# 0006 — Vault-backed shared tokens for cron-triggered functions

## Status

Accepted (current behavior; migration `20260814180000_email_queue_shared_token`
and the equivalent for `send-ops-alert` implemented it).

## Context

A handful of edge functions (`process-email-queue`, `send-ops-alert`) are
only ever called by `pg_cron`, not by a user or by n8n. `pg_cron` runs inside
Postgres and has no Deno runtime — it cannot hold or send a Supabase JWT, so
these functions can't authenticate the way user-facing or n8n-facing
functions do, and `verify_jwt = false` has to be set for the gateway to let
the call through at all.

The earlier design used a full `service_role` key as the cron credential
(`email_queue_service_role_key`), stored as a secret the cron job could read.
That key is maximally privileged — it bypasses RLS entirely — and it doesn't
survive a project snapshot/restore, which made it an operational trap: a
restored project would silently carry a stale, non-functional credential
until someone noticed the cron path was failing.

## Decision

Replace the service-role credential with a purpose-specific shared token
stored in Postgres Vault (`email_queue_shared_token`, `ops_alert_shared_token`)
and checked through a `SECURITY DEFINER` RPC (`verify_email_queue_token()`,
`verify_ops_alert_token()`) that returns a boolean. The cron job passes the
token over HTTP in a custom header (`X-Email-Queue-Token`,
`X-Ops-Alert-Token`); the raw secret itself never crosses PostgREST or
appears in an HTTP response, only the RPC's true/false verdict does.

## Consequences

- The credential in play is scoped to exactly one capability (proving "I am
  the legitimate cron caller") rather than carrying full service-role
  privilege — a leaked token authorizes triggering the queue drain or the
  alert check, nothing else.
- Survives project snapshot/restore, closing the operational trap the old
  design had.
- Same shape reused for both functions rather than inventing a new pattern
  per function, so a reader who understands one understands the other.
- Documented in full in `docs/environment-variables.md` and cross-referenced
  from `supabase/config.toml`'s comments, so the reason `verify_jwt = false`
  is set on these functions is discoverable without archaeology.
