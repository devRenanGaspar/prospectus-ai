# Security and Performance Risk Register

**Last review:** 2026-08-21, against `supabase get_advisors` and direct queries.

Findings are either accepted with controls or open with an owner. An accepted
finding is not ignored; it must remain applicable and be reviewed when its
dependency or architecture changes. Resolved findings are not kept here —
this file describes current risk, not history; `docs/incidents.md` is where
past production events are recorded.

**Operating context, because it is what several acceptances below rest on:**
Prospectus is winding down. It is no longer sold, and a handful of accounts
still use it. Work on this system is now limited to keeping those accounts
working and to not leaving a hazard behind. Several findings below would be
fixed rather than accepted on a product still taking new customers; the
reasoning is recorded per entry rather than left implicit.

| ID | Finding | Status | Next review |
|---|---|---|---|
| SEC-001 | React Router advisory `GHSA-qwww-vcr4-c8h2` | Accepted temporarily | 2026-08-31 |
| SEC-002 | Twelve authenticated `SECURITY DEFINER` advisor warnings | Accepted with review | Every DDL change |
| SEC-003 | 57 tables have RLS enabled with no policy | Accepted | Every grant change |
| SEC-011 | Leaked-password protection is disabled in Supabase Auth | Open | 2026-09-30 |
| SEC-012 | `n8n-proxy` read actions are not scoped to a tenant | Accepted, wind-down | If the product resumes selling |
| SEC-013 | No Content-Security-Policy or HSTS, with sessions in `localStorage` | Accepted, wind-down | If the product resumes selling |
| SEC-014 | Impersonation is audited at link issuance, not per action | Accepted | If a second admin is ever added |
| SEC-015 | `send-ops-alert` accepts caller-supplied recipients and HTML | Accepted, wind-down | If the token is ever shared further |
| SEC-016 | An admin can set their own password without presenting the current one | Accepted | If a second admin is ever added |
| PERF-001 | 105 Supabase performance advisor notices | Open, measured | Monthly |
| OPS-003 | Two functions carry an unreachable short-form signature | Deferred | No trigger; revisit only if a caller appears |
| OPS-004 | Regenerating `types.ts` reintroduces customer phone numbers | Open, procedural | Every type regeneration |

### SEC-001 — React Router advisory `GHSA-qwww-vcr4-c8h2`

The advisory affects unstable React Server Components APIs. Prospectus is a
Vite SPA using `BrowserRouter` and has no RSC path, so the advisory doesn't
apply to how this app uses the library. Migrate when a compatible patched
line is available; tracked manually, since Dependabot's automated PRs are
disabled (unreviewed noise on a solo project — dependency updates go through
manual review, driven by this register and by `npm audit` output).

### SEC-002 — Twelve authenticated `SECURITY DEFINER` advisor warnings

Every `SECURITY DEFINER` function callable by `authenticated` via PostgREST,
measured today: `admin_update_user_profile`, `fail_copy_request`,
`fail_search`, `get_admin_copy_quality`, `get_current_user_role`,
`get_lead_pool_summary`, `is_active_user`, `is_admin`,
`request_account_deletion`, `request_copy`, `request_find_leads`,
`request_send`.

`request_find_leads`, `request_copy`, `request_send` and `fail_search` are
intentional transactional APIs — the whole point of the atomic-charge design
(see `docs/adr/0002-atomic-charge-rpcs.md`). The rest are admin or read
helpers that enforce their own authorization contract inside the function
body (`is_admin()` checks, role checks, or a WHERE clause scoped to
`auth.uid()`). Grants and function bodies must be re-reviewed after any
change to one of these functions or to the tables they touch.

### SEC-003 — 57 tables have RLS enabled with no policy

The 57 are three shapes, not two, and the arithmetic is worth stating because
an earlier version of this entry named two and did not add up: 54 per-tenant
`crm_<phone>` conversation-state tables, 2 `n8n_<phone>` tables holding the
agent's own conversation memory for the two accounts whose workflows still run
against the pre-migration project, and `user_google_tokens`, which holds
Google refresh tokens. The per-tenant shapes are inherited from the
pre-migration n8n design — see
`docs/adr/0005-force-cutover-without-full-migration.md`. Neither `anon` nor
`authenticated` has a table grant on any of them; only `service_role`
(server-side code) reaches them, and RLS with zero policies denies
PostgREST access even to a caller who somehow obtained a grant. Re-review
whenever a table in either category needs to be read from the client instead
of through an edge function.

### SEC-011 — Leaked-password protection is disabled in Supabase Auth

Supabase Auth can reject passwords found in the HaveIBeenPwned breach corpus
at signup and password-change time; that check is currently off. Enabling it
is a dashboard toggle (Authentication → Policies → Leaked password
protection), not a code change. No known incident depends on this — it is a
defense-in-depth gap, not an active exposure.

### SEC-012 — `n8n-proxy` read actions are not scoped to a tenant

`query_leads`, `get_lead_by_phone` and `get_user_context` in
`supabase/functions/n8n-proxy/handler.ts` run under `service_role`, which
bypasses RLS, and apply only the filters the caller sent. None of them adds a
`user_id` predicate. A caller holding `N8N_SHARED_TOKEN` can therefore read
leads belonging to any account, up to the 200-row cap, with an ordinary filter
such as `{"status":"NEW"}`.

The token is not a user credential — it is shared infrastructure, present in
roughly thirty n8n workflow nodes, with no rotation mechanism and no expiry.
That is the real exposure: the read scoping and the token handling are one
risk, not two.

Accepted rather than fixed. Adding tenant scoping means changing the contract
every one of those workflows depends on, and the accounts still running are
the ones that would break. On a product still taking customers this would be
fixed instead, and the fix would be the scoping and a rotation path together.
The compensating control is that the token reaches no path that can escalate:
`SENSITIVE_ACTIONS` in `supabase/functions/_shared/sensitive-actions.ts` keeps
credit movement, impersonation and calendar-token exchange behind separate
credentials, and `supabase/functions/_tests/n8n-proxy.auth-matrix.test.ts`
asserts that separation across all 26 actions on every CI run.

### SEC-013 — No Content-Security-Policy or HSTS, with sessions in `localStorage`

`public/_headers` sets `X-Content-Type-Options`, `X-Frame-Options`,
`Referrer-Policy` and `Permissions-Policy`, and those four are live —
`curl -sI https://prospectus.ia.br` returns them. It sets no
`Content-Security-Policy` and no `Strict-Transport-Security`, and
`index.html` carries no `<meta http-equiv>` equivalent. Supabase sessions are
stored in `localStorage` (`src/integrations/supabase/client.ts`), so they are
readable by any script running on the origin, and the marketing page loads
Google Tag Manager.

Accepted rather than fixed. A CSP tight enough to be worth having has to be
derived from what the app actually loads and then verified against every
route; getting it wrong ships a blank page to the accounts still using the
product. HSTS is genuinely cheap and is the part worth doing first if this is
revisited. Recorded here rather than left for a reader to discover with one
`curl`, which is how they would discover it.

### SEC-014 — Impersonation is audited at link issuance, not per action

`admin-impersonate` mints a single-use magic link, writes an audit row saying
the link was issued, and returns it; `src/hooks/useImpersonate.ts` then
navigates to it. After redemption the admin holds an ordinary customer
session, and there is no server-side impersonation context — so every
subsequent action is recorded exactly as if the customer had performed it.
The audit trail proves a link was minted and nothing about what was done with
it. The link also passes through the address bar, so it enters browser
history.

Accepted. The audit gap matters when more than one person can impersonate,
and there is exactly one admin account. It is recorded because the gap is
real under LGPD: an agency using Prospectus is itself a controller for its
leads' data, and this system cannot show it who accessed what.

### SEC-015 — `send-ops-alert` accepts caller-supplied recipients and HTML

The function is gated only by `X-Ops-Alert-Token` and takes `to[]`, `subject`
and `html` from the request body with no recipient allow-list, sending from
the product's own address. Anyone holding that token can send arbitrary HTML
to arbitrary addresses from a domain that passes the product's SPF and DKIM.

Accepted rather than fixed. The token lives only in the Vault and is read by
`pg_cron` jobs; it is not distributed the way `N8N_SHARED_TOKEN` is. An
allow-list on `to[]` is the obvious control and is the first thing to add if
that ever changes.

### SEC-016 — An admin can set their own password without presenting the current one

`admin-update-password` refuses one admin changing another admin's password,
but the guard is `target.role === "ADMIN" && target.id !== callerId`, so an
admin acting on their own account passes it. No step-up or re-authentication
exists anywhere in the system. Combined with SEC-013, a stolen admin session
can be made permanent.

Accepted. There is one admin account, and it belongs to the operator. The
reason this is written down rather than quietly left alone is that the
condition reads as deliberate — it is four lines below a comment reasoning
about admin-versus-admin takeover — and a reader deserves to know it was
noticed rather than missed.

### PERF-001 — 105 Supabase performance advisor notices

Measured today: 59 RLS init-plan, 19 overlapping-policy, 17 unused-index, 9
unindexed-FK and 1 duplicate-index. Add safe FK/RLS improvements through
reviewed migrations; remove indexes only after workload evidence, since an
index that looks unused can still be load-bearing for a query that runs
rarely but must stay fast when it does.

### OPS-003 — Two functions carry an unreachable short-form signature

`assign_lead_to_user` and `deduct_credits`/`deduct_credits_bulk` each exist
with and without a trailing parameter (`_search_id`, `_phone`). `n8n-proxy`
always passes the trailing parameter, so the short forms are unreachable
from the only caller. `pg_stat_statements` confirms zero invocations of the
short forms over its measurement window.

`DROP FUNCTION` on the two unreachable short forms is deliberately not
done: the owner does not permit destructive database changes without a
concrete trigger, the gain is cosmetic, and the cost of being wrong — a
caller this measurement missed — is broken billing.

### OPS-004 — Regenerating `types.ts` reintroduces customer phone numbers

The per-tenant tables are named after the account's WhatsApp number
(`crm_5511…`, `n8n_5511…`) — `supabase/migrations/20260814213355_seed_per_tenant_crm_tables_before_n8n_cutover.sql`
builds the name as `'crm_' || whatsapp_number`. So the generated
`src/integrations/supabase/types.ts` carries 56 customer phone numbers by
default, and regenerating it puts them back.

They are stripped from the committed file, and nothing in `src/` references
those types, so the strip costs nothing. But this is a recurring hazard rather
than a fixed defect: the next `supabase gen types` reintroduces it silently.

Anyone regenerating that file must strip the per-tenant table blocks before
committing, and confirm it with:

```
git ls-files -z | xargs -0 grep -lE '\b(crm|n8n)_55[0-9]{9,11}\b'
```

which must return nothing. This is the durable half of the fix; the strip
itself was only the instance.

## Dependency audit policy

**High** and critical production advisories block CI (`npm audit --omit=dev
--audit-level=high`). Anything below high requires remediation or an entry
above with applicability, compensating controls, owner and review date. When
accepting a finding here, run the command the justification names and paste
what it actually returned — an exception whose justification was never
verified is worse than no exception, because it stops the next reader from
checking.

Dependabot's automated version-update and security-update PRs are disabled;
dependency updates are reviewed manually, driven by this register and by
`npm audit` output rather than a scheduled bot.

## Supabase advisor references

- Security Advisor: https://supabase.com/docs/guides/database/database-advisors
- RLS performance: https://supabase.com/docs/guides/database/postgres/row-level-security#rls-performance-recommendations
- Password protection: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
