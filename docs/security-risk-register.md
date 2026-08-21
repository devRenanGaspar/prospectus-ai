# Security and Performance Risk Register

**Last review:** 2026-08-21, against `supabase get_advisors` and direct queries, not against what an earlier revision of this file claimed.

Findings are either accepted with controls or open with an owner. An accepted
finding is not ignored; it must remain applicable and be reviewed when its
dependency or architecture changes. Resolved findings are not kept here —
this file describes current risk, not history; `docs/incidents.md` is where
past production events are recorded.

| ID | Finding | Status | Next review |
|---|---|---|---|
| SEC-001 | React Router advisory `GHSA-qwww-vcr4-c8h2` | Accepted temporarily | 2026-08-31 |
| SEC-002 | Twelve authenticated `SECURITY DEFINER` advisor warnings | Accepted with review | Every DDL change |
| SEC-003 | 57 tables have RLS enabled with no policy | Accepted | Every grant change |
| SEC-011 | Leaked-password protection is disabled in Supabase Auth | Open | Next session |
| PERF-001 | 105 Supabase performance advisor notices | Open, measured | Monthly |
| OPS-003 | Two functions carry an unreachable short-form signature | Deferred | No trigger; revisit only if a caller appears |

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

Deny-by-default is the intended state for two shapes of table here: the
per-tenant `crm_<phone>` conversation-state tables (one per connected
WhatsApp number, inherited from the pre-migration n8n design — see
`docs/adr/0005-force-cutover-without-full-migration.md`) and
`user_google_tokens`, which holds Google refresh tokens. Neither `anon` nor
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
