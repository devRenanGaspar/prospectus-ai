# 0005 — Force the n8n/Supabase cutover without a full historical migration

## Status

Accepted, with a known unfinished piece (README roadmap #5).

## Context

In August 2026, `ops_stuck_leads` surfaced that n8n's published workflows
were still writing to a pre-migration Supabase project while the application
had already moved to the current one. Copy generation was being charged in
the current project and completed in the old one — invisible to either side
— so 191 leads sat in `COPY_PENDING` for four days before detection. 717
credits were eventually refunded and the leads returned to `NEW`. The
detection worked (the operational view had it flagged the whole time); the
response didn't, because nothing was paging anyone.

The clean fix — migrate all historical per-tenant conversation state
(`crm_<tenant>` tables and n8n's own conversation memory) from the old
project to the new one, then repoint every workflow atomically — was not
something that could be done safely in the time available. Leaving the split
in place indefinitely wasn't an option either: every hour the agent workflows
kept running against the old project was another hour of silently unwritten
messages.

## Decision

Cut over the conversation-path workflows immediately rather than wait for a
full migration, accepting a known, bounded loss: pre-cutover n8n conversation
memory for in-flight conversations does not carry forward. Before repointing,
the per-tenant `agent_on_off` flag — the one piece of state that would cause
real harm if lost, since an agent an operator had switched off could
otherwise resume messaging that lead — was recovered from the application's
own source of truth (`leads.ai_agent_enabled`) and seeded into fresh tables in
the current project ahead of the repoint.

## Consequences

- Conversation continuity broke for leads mid-conversation at the moment of
  cutover; a returning lead's agent has no memory of the exchange before the
  cutover.
- The `agent_on_off` mitigation specifically protected against the highest-
  harm failure mode (a silenced agent un-silencing itself), at the cost of
  not protecting a lower-harm one (conversation memory) that was judged
  acceptable to lose.
- The underlying gap is still open: some n8n nodes read and write per-tenant
  state in the pre-migration project (README roadmap #5). This ADR records
  why the cutover happened when it did, not a claim that the migration is
  finished.
- Directly motivated two of the operational views this repository documents
  (`ops_stuck_leads`, and the broader "operational views are the alerting
  surface" section of the README) — they're what caught this, and the
  four-day detection-without-response gap is why paging (roadmap #6) is
  next after the eval-set gap.
