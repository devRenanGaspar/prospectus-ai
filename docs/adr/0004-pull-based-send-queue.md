# 0004 — Pull-based send queue for WhatsApp rate limiting

## Status

Accepted (current behavior).

## Context

WhatsApp numbers get flagged and banned for sending too many messages too
fast, especially to numbers that haven't opted in. Cold outreach at any real
volume runs directly into this: if the system sent a message the moment a
lead entered `SEND_PENDING`, message volume would be bursty and driven by
however many leads happened to reach that state together, with no natural
ceiling.

## Decision

Sending is pull-based, not push-based. `send-queue-poll` is an edge function
that n8n calls on a fixed 30-minute schedule; each call returns at most one
lead per account. The application never pushes a "send now" event to n8n —
it only ever queues a lead into `SEND_PENDING` and waits.

## Consequences

- The poll interval and per-account cap *are* the rate limiter — there's no
  separate rate-limiting mechanism to build or maintain.
- This trades latency for safety by design: the README is explicit that
  send-latency p50 is "mostly queue wait," not slowness, and that reading it
  as a performance metric would be a misread of what's actually being
  measured.
- It bounds throughput per account regardless of how many leads are queued
  at once, which is the property that matters — a backlog of 500 queued
  sends still egresses at one per poll interval per account (15 minutes as
  configured today), not as a burst.
- The cost is a hard latency floor for every send, with no fast path even
  when a real human is actively waiting for a reply — accepted as the
  correct trade given the alternative is losing the WhatsApp number.
