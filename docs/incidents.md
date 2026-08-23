# Incidents

Production incidents, written up after the fact. These writeups carry no
customer names and no tenant identifiers; they are not a complete log of
everything that has gone wrong. Each entry: what happened, how it was found,
what fixed it, what it changed going forward.

## 2026-08 — n8n writing to the wrong Supabase project

**Impact.** 191 leads stuck in `COPY_PENDING` for 4 days. Copy generation had
been charged (credits debited, lead moved to `COPY_PENDING`) but the
generation itself, and the callback that would have moved the lead to
`COPY_READY`, never happened — because n8n's published workflows were still
writing to the project this application had migrated away from.

**Detection.** `ops_stuck_leads`, a read-only operational view built for
exactly this failure mode, had the affected leads flagged for the entire four
days. Nothing paged anyone; the view was checked manually.

**Root cause.** A half-finished cutover. The application's edge functions and
credit-charging RPCs ran against the current Supabase project; n8n's
*published* workflow versions (as opposed to their drafts) still pointed at
the pre-migration project. Both sides ran without erroring, which is what
made this hard to notice — a broken call fails loudly; a call that succeeds
against the wrong database doesn't.

**Fix.** Affected leads refunded and returned to `NEW`. The conversation-path
workflows were then force-cut-over to the current project rather than waiting
for a full historical migration — see
[ADR 0005](adr/0005-force-cutover-without-full-migration.md) for why, and what
that decision knowingly gave up.

**Changed going forward.** This is the concrete example behind README roadmap
item #6, "no paging" — the detection worked and the response didn't, because
nothing forced a human to look at `ops_stuck_leads` sooner than "eventually."

## 2026-07 — a merged security fix sat undeployed for ~5 weeks

**Impact.** `admin-impersonate` and `admin-update-password` continued
returning raw runtime error strings (`JSON.stringify({ error: String(err) })`)
to the client in production, weeks after the code fixing this (routing errors
through a classifier and returning a generic `{ error, error_code }` shape
instead) had been reviewed and merged to `main`.

**Detection.** Not automated. Found by directly comparing the deployed
function's live behavior against what the merged code on `main` should have
produced, while auditing "is everything actually deployed" rather than
trusting merged-PR status as a proxy for it.

**Root cause.** Merging a pull request on GitHub does not deploy a Supabase
edge function — deployment is a separate, explicit step. Nothing enforced
that the second step happened after the first.

**Fix.** Both functions redeployed from the already-merged, already-correct
source, then verified live to confirm the deployed code matched the
repository.

**Changed going forward.** This is now a standing checklist item whenever a
"was this actually shipped" question comes up: merged is not deployed,
confirm the running function's behavior directly rather than inferring it
from git history.

## 2026-08 — a broken alert meant a real failure had no signal

**Impact.** When the SDR agent's calendar tool couldn't book a slot (calendar
not connected), the workflow was supposed to notify the agency owner. It
didn't — the notification silently failed every time, so an operator whose
calendar disconnected had no way to find out short of a lead telling them
scheduling wasn't working.

**Root cause.** Two field-name mismatches in the alert-sending node's
parameters (a cross-node expression reading the wrong field for the target
phone number and the API URL), so the outbound request resolved to an
invalid endpoint and failed before it could send anything.

**Fix.** Corrected the field references, published, verified with no
remaining validation warnings.

**Changed going forward.** A reminder that a workflow node can be "wired up"
and still be silently broken — nothing about the node's configuration looked
wrong at a glance; it only became visible by tracing the actual field
references against what the upstream node produced.
