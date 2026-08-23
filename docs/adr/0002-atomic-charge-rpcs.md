# 0002 — Atomic charge RPCs instead of client-side debit

## Status

Accepted (current behavior; migrations `20260707120200_atomic_lead_action_rpcs`
and `20260707120300_enforce_paid_lead_transitions` implemented it, replacing
an earlier client-side flow).

## Context

Every paid action in this system (search for leads, generate copy, send a
message) has to do two things that must not disagree: debit the account's
credits, and move the lead into the corresponding processing state
(`COPY_PENDING`, `SEND_PENDING`, etc.). The original implementation did this
as three separate client-issued calls — deduct credits, insert a request row,
update lead status — from the browser.

That shape has a real bug class, not a theoretical one:
`src/test/credit-flows.test.tsx` exists specifically because of it. With debit
and status transition as separate calls, a client could send a lead straight
to `SEND_PENDING`/`COPY_PENDING` without the debit ever landing — or the debit
could succeed while the status update failed, charging the customer for
nothing. Either half of the pair could fail independently, and nothing tied
their outcomes together.

## Decision

Collapse charge + transition into one `SECURITY DEFINER` Postgres RPC per
paid action (`request_send`, `request_copy`, `request_find_leads`), each
idempotent by a client-supplied `request_id`. The database also actively
prevents the old path: a trigger rejects direct `UPDATE`s that transition a
lead into `COPY_PENDING`/`SEND_PENDING`, and `INSERT` on the request tables is
revoked from the `authenticated` role — so the only way into those states is
through the RPC.

## Consequences

- A double click costs nothing extra: the RPC is a no-op (zero charge) if the
  lead is already in the destination state.
- The client cannot forge a paid transition even with a valid, unexpired JWT —
  enforced at the schema level, not just in application code.
- `webhook-proxy` (which forwards the paid operation on to n8n) reads the
  cost-defining parameters back from the already-charged request row rather
  than trusting whatever the client's payload says, closing a "pay for 1, ask
  for 1000" gap that would otherwise exist between the RPC call and the
  webhook forward.
- `src/test/credit-flows.test.tsx` encodes this as a permanent regression
  gate: it asserts `deduct_credits_bulk` and direct `.from("leads").update()`
  are never called from these hooks again, specifically so the old pattern
  can't quietly come back.
