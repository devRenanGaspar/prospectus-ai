# Engineering Baseline v1

**Established:** 2026-08-05

**Repository:** `devRenanGaspar/prospectus-ai`

**Production Supabase:** `tumqhovjzjojmrfoshou`

The public repository is a squashed snapshot, so the dates below describe when
the work happened, not commits a reader can open. Where a claim here can be
checked against something that ships — the workflow file, the migrations, the
config — that is the thing to check.

This document defines the minimum engineering controls for Prospectus. It is a
living contract: thresholds may become stricter, but weakening one requires a
documented reason and risk review.

## Supported platform

- Node.js 22.16.0 and npm 10.
- React/Vite SPA deployed by Cloudflare Pages from GitHub.
- Supabase Postgres, Auth, Realtime and Edge Functions.
- The versioned SQL files in `supabase/migrations/` are the database source of
  truth. Production migration history must match the repository.

## Required pull-request gates

The `CI / verify` job must pass before merge. It runs:

1. `npm ci`
2. `npm run lint` with zero warnings
3. `npm run typecheck` (under `strict`, since 2026-08-17)
4. `npm run functions:check`, a `deno check` over the edge functions, which the
   frontend type-check does not reach
5. `npm run functions:test`, the Deno suite that drives the edge function
   handlers directly
6. `npm run deps:check`, failing on a production dependency that is declared
   and never imported
7. `npm run env:check`, reconciling `docs/environment-variables.md` against the
   actual `Deno.env.get()` call sites
8. The four SQL contracts, against a database rebuilt from
   `supabase/migrations/` alone on a fresh local Supabase stack:
   `replay_contract.sql` (the seeded reference data the product needs to
   function at all), `credit_rpc_contract.sql` (idempotency,
   insufficient-balance rejection, exact-debit correctness and refund
   correctness for `request_send`, `request_copy`, `request_find_leads`,
   `fail_copy_request` and `refund_unused_search_credits`),
   `admin_rpc_contract.sql` (the signature, grants and clear-plan behaviour of
   `admin_update_user_profile`) and `phase3_observability_contract.sql` (the
   observability tables, their RLS and the four lifecycle-capture triggers),
   documented further in
   `docs/operations/observability-event-contract.md`.
9. `npm run test:count`
10. `npm run test:coverage`
11. `npm run build`
12. `npm run bundle:check`
13. `npm run audit:prod`, blocking **high** and critical production advisories

CodeQL analyzes JavaScript and TypeScript on pull requests, pushes to `main`,
and weekly. Dependabot's automated update PRs are disabled (2026-08-17);
dependency updates are reviewed manually — see `security-risk-register.md`.

## Measured floors

| Signal | Measured | Enforcement |
|---|---:|---|
| Unit/integration tests | 201 Vitest + 20 Deno = 221 passing | `npm run test:coverage`, `npm run functions:test` |
| Statement coverage | 12.19% | floor 11% |
| Line coverage | 12.19% | floor 11% |
| Branch coverage | 50.90% | **not enforced** — see below |
| Function coverage | 34.13% | **not enforced** — see below |
| SQL contracts | 4 files | `replay_contract.sql`, `credit_rpc_contract.sql`, `admin_rpc_contract.sql`, `phase3_observability_contract.sql` in CI |
| Total built JavaScript | 1,839,510 bytes | 3 MiB budget |
| Largest standard chunk | 741,552 bytes | 750 KiB budget |

Coverage is low, and the floor is a regression catch rather than a quality
claim. Branch and function coverage are not gated because the v8 provider
counts one placeholder branch and function for every file it never executed,
which is most of this project — so those two percentages move the wrong way
as tests are added.

The `LocationPicker` exception (2026-08-05 – 2026-08-17) is gone: the
component imported `country-state-city`, a GPL-3.0 dependency covering four
countries, and produced an 8.76 MB chunk on its own. Replaced with a static
Brazil-only dataset generated from IBGE's public data (`src/data/br-locations.json`,
~83 KB) — production data showed zero accounts had ever used the other three
countries. The chunk is now ~129 KB, under the standard budget like
everything else, and the total JavaScript budget was tightened from a
10.25 MiB ratchet (calibrated mostly to fit that one chunk) to 3 MiB.

## Database baseline

On 2026-08-05, production and the repository were reconciled at 74 migrations.
The reconciliation added the refunded-search delivery barrier and restricted
legacy privileged functions. Verification confirmed that delivery helpers are
service-role-only and contain the refund barrier.

On 2026-08-18 the two were reconciled **version by version** for the first time,
at 96 migrations. Both sides had had the same count for a while, which is what
hid the problem: eight versions differed. They were the same eight migrations,
same `name` and same relative order, applied to production through platform
tooling that stamps its own timestamp while the repository file carried a
hand-chosen one.

The direction of the fix was to rename the repository files to production's
versions, never the other way round: production records what actually ran, and
the repository is the copy.

Before renaming anything, each pair's body was compared against production's
`schema_migrations.statements`, whitespace- and comment-normalised. That gate
was not ceremony — it is what caught the two findings below, and treating
"same name, same order" as proof of equivalence would have missed both:

- Six pairs were identical. One differed only in SQL comments, one only in
  accented characters inside a `COMMENT ON FUNCTION` string.
- The eighth is different **on purpose** and stays that way: the repository
  holds an inert, redacted record of a manual one-off remediation, while
  production held the statements that actually ran. Recorded here rather than
  left as silent drift.
- Those production statements still contained a customer's account UUID, and
  the ledger row was still named after the customer. The 2026-08-17 history
  rewrite had cleaned git and never swept the database. Redacted 2026-08-18;
  `schema_migrations` now has zero occurrences of either.

`comm` over the 96 versions on each side returns empty in both directions, so
the "production migration history must match the repository" rule above is now
a checked fact rather than an aspiration.

After every DDL change:

- verify local/remote migration parity;
- rerun Supabase security and performance advisors;
- inspect grants, RLS, views and `SECURITY DEFINER` functions;
- regenerate `src/integrations/supabase/types.ts` when the API schema changes;
- execute a behavior-level verification query.

The current advisor inventory and accepted exceptions are documented in
[`security-risk-register.md`](security-risk-register.md).

## Repository and deployment controls

- Changes reach `main` through pull requests.
- Branch protection requires the `CI / verify` status check, an up-to-date
  branch, resolved review conversations and linear history.
- The Cloudflare Pages preview is a review signal; its exact GitHub status
  context should be added to branch protection after it is observed on a pull
  request.
- Production deploys originate from `main` only. Merging to `main` deploys every
  Supabase edge function automatically — see the `deploy-functions` job in
  `.github/workflows/ci.yml`.
- The applied `main` protection payload is versioned at
  `.github/branch-protection.json`; repository-setting changes must keep that
  file in sync.
- Rollback follows [`runbooks/deploy-and-rollback.md`](runbooks/deploy-and-rollback.md).

## Next quality targets

1. Add browser smoke tests for login, dashboard, lead search and logout.
2. Cover permission checks and every paid-operation failure path.
4. Enable stricter TypeScript options incrementally.
5. Triage Supabase performance advisors using query evidence before removing
   indexes or merging policies.
