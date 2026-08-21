# Environment variables and secrets

An inventory of every secret this system reads, where it's read from, and why
— verified against the actual `Deno.env.get()` / Vault call sites, not
copied from memory of what the code does. `npm run env:check` re-verifies
this on every CI run; see the note at the bottom for the methodology.

There are two entirely separate secret stores in play, and mixing them up is
an easy way to misconfigure a deploy:

- **Client build-time variables** — baked into the static bundle by Vite at
  build time. Never secret; anything here is visible in the shipped
  JavaScript. Template lives in [`.env.example`](../.env.example).
- **Supabase Edge Function secrets** — server-side, read via `Deno.env.get()`
  inside a function's own runtime. Set per-project in the Supabase dashboard
  (or `supabase secrets set`), never committed.
- **Postgres Vault secrets** — a third category, not exposed as Edge Function
  env vars at all. Used for the handful of secrets that a `pg_cron` job needs,
  because cron runs inside Postgres and has no Deno environment to read from.
  Read via a `SECURITY DEFINER` RPC that checks the caller's token against
  `vault.decrypted_secrets` and returns a boolean — the raw secret itself
  never crosses PostgREST or an HTTP response.

## Client build-time variables

From `.env.example`, consumed by `src/` via `import.meta.env`:

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_PROJECT_ID` | Project ref, used to build a couple of dashboard/API URLs shown in the admin UI |
| `VITE_SUPABASE_URL` | Supabase client init |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase client init (anon key — safe to ship, RLS is what actually protects data) |
| `VITE_SUPPORT_EMAIL` / `VITE_SUPPORT_WHATSAPP_DISPLAY` / `VITE_SUPPORT_WHATSAPP_NUMBER` | Support contact links rendered in the UI; optional |
| `VITE_OBSERVABILITY_SAMPLE_RATE` | Sampling rate for the privacy-safe frontend telemetry collector (`docs/operations/frontend-observability.md`) |
| `VITE_APP_RELEASE` / `VITE_APP_BUILD` | Attached to telemetry events so a regression can be pinned to a deploy |

## Edge Function secrets (`Deno.env.get`)

| Variable | Used by | Purpose |
|---|---|---|
| `SUPABASE_URL` | every function | Client init |
| `SUPABASE_ANON_KEY` | `admin-impersonate`, `admin-update-password`, `google-calendar-disconnect`, `google-calendar-auth-url`, `frontend-telemetry`, `webhook-proxy` | A user-scoped client, so RLS applies while validating the caller's own JWT before switching to service-role for the privileged part of the call |
| `SUPABASE_SERVICE_ROLE_KEY` | `admin-impersonate`, `admin-update-password`, `n8n-proxy`, `google-calendar-disconnect`, `google-calendar-auth-url` (as an HMAC secret for OAuth state, not for a client), `google-calendar-callback` (same), `send-queue-poll`, `webhook-proxy`, `frontend-telemetry`, `auth-email-hook`, `process-email-queue`, `send-ops-alert` | Bypasses RLS for the function's own privileged writes. `google-calendar-auth-url`/`-callback` reuse it as an HMAC signing key for OAuth `state` rather than for a Supabase client — worth knowing if this key is ever rotated, since that also invalidates in-flight OAuth redirects |
| `N8N_SHARED_TOKEN` | `n8n-proxy`, `send-queue-poll` | The operational token n8n sends on every call into these two functions. If leaked it gives write access to every tenant's data through `n8n-proxy` |
| `N8N_ADMIN_SHARED_TOKEN` | `n8n-proxy` | Second credential required by the five actions that move money or change access (`add_credits`, `deduct_credits`, `deduct_credits_bulk`, `renew_subscription`, `set_user_access`); those five return **403** to a caller holding only `N8N_SHARED_TOKEN`. The allow-list lives in `supabase/functions/_shared/sensitive-actions.ts`, which the guard tests import directly rather than mirror |
| `N8N_CALENDAR_TOKEN` | `n8n-proxy` | Third credential, required by `get_calendar_access_token` and *only* that action -- not the operational token, and deliberately not the admin one either, because a second accepted credential would be a second door to a customer's calendar. Held as an `httpHeaderAuth` credential on the `Busca Access Token` node of `PRS - TEMPLATE - 99_Tool - Agendamento`, so it never travels through the SDR agent workflows. The tier lives in `supabase/functions/_shared/sensitive-actions.ts`, which the guard tests import directly rather than mirror |
| `GOOGLE_CLIENT_ID` | `google-calendar-auth-url`, `google-calendar-callback`, `n8n-proxy` | Google OAuth app client id for the calendar integration. `n8n-proxy` reads it in `get_calendar_access_token`, which exchanges a stored refresh token for a short-lived access token so the scheduling workflow never receives the refresh token itself |
| `GOOGLE_CLIENT_SECRET` | `google-calendar-callback`, `n8n-proxy` | The matching client secret. Listed separately from the id because `google-calendar-auth-url` only builds the consent URL and never exchanges a code, so it reads the id and not the secret -- a single combined row said otherwise |
| `SEND_EMAIL_HOOK_SECRET` | `auth-email-hook` | Validates the signature Supabase Auth attaches to its email-sending webhook |
| `RESEND_API_KEY` | `process-email-queue`, `send-ops-alert` | Resend API key for transactional and ops-alert email delivery |
| `EMAIL_API_URL` | `process-email-queue`, `send-ops-alert` | Overrides the Resend API base URL; unset in production, exists for testing against a mock endpoint |
| `OBSERVABILITY_ALLOWED_ORIGINS` | `frontend-telemetry` | CORS allow-list for the browser telemetry collector |

## Postgres Vault secrets

Not Edge Function env vars — stored in `vault.decrypted_secrets`, checked via
RPC. Each pairs with a function above that receives a *token*, not a key, over
HTTP; the function forwards that token to the RPC and only proceeds on a
boolean `true`.

| Secret name | Checked by | Used for |
|---|---|---|
| `email_queue_shared_token` | `verify_email_queue_token()` RPC, called from `process-email-queue` | Lets the `pg_cron` job that drains the email queue authenticate without a Supabase JWT (cron has no Deno runtime to hold one) |
| `ops_alert_shared_token` | `verify_ops_alert_token()` RPC, called from `send-ops-alert` | Same shape, for the copy-quality and other `pg_cron`-triggered alert emails (`private.check_and_send_copy_quality_alert()` and siblings) |

Both replaced an earlier design that used a full `service_role` key as the
cron credential (`email_queue_service_role_key`) — that key doesn't survive a
project snapshot/restore, which is why the shared-token RPC pattern exists
instead. See the comments in `supabase/config.toml` and
`supabase/migrations/20260814180000_email_queue_shared_token.sql`.

## Cross-reference: why `verify_jwt = false`

`supabase/config.toml` sets `verify_jwt = false` for every function
authenticated by a shared token or a webhook signature instead of a Supabase
JWT (`n8n-proxy`, `send-queue-poll`, `process-email-queue`, `send-ops-alert`,
`auth-email-hook`, `google-calendar-auth-url`, `google-calendar-callback`).
With the default `verify_jwt = true`, the API gateway rejects the request
before the function body ever runs — which is correct for a real Supabase JWT,
but these callers don't have one to send. `webhook-proxy` is also
`verify_jwt = false` despite taking a user JWT, because it validates that JWT
itself (via `SUPABASE_ANON_KEY`) rather than letting the gateway do it —
needed because it also has to distinguish "no token" from "invalid token" in
its own response shape.

## Not in the schema: what a new environment must be configured with

`supabase/migrations/` builds a working database, and
[`supabase/tests/replay_contract.sql`](../supabase/tests/replay_contract.sql)
asserts it in CI. Two things are deliberately left out of that, because they
are per-environment infrastructure rather than reference data, and seeding them
would hard-code production into every clone:

- **`webhook_configs`** — the n8n endpoint URLs the app calls. Production has
  six rows; a new environment has none and must have its own inserted. Nothing
  in the schema depends on them existing, but the integrations stay inert until
  they do.
- **The email-queue wake triggers** — `email_queue_wake_auth` and
  `email_queue_wake_transactional` on the `pgmq` queue tables. They exist in
  production but no migration creates them, and they are not captured on
  purpose: the function they call,
  `email_queue_wake` (`20260814180000`), has the production project URL
  hard-coded in its body, so recreating the triggers elsewhere would point a
  new environment's queue at production with a token production does not
  recognise. Signup-confirmation and password-reset emails therefore do not
  drain in a fresh environment until this is wired up per-environment.

Both are listed here rather than silently diverging, which is the same defect
this section exists to close.

## What is actually configured

The table above lists what the code *reads*. That is not the same as what the
project *has* -- a secret that was never created can still be documented as if
it were in use, and nothing about reading source code catches that.

`supabase secrets list --project-ref tumqhovjzjojmrfoshou` returns names and
SHA-256 digests, never values. Comparing it against the table above confirms
every variable there is actually configured, with two verified beyond mere
presence: `N8N_SHARED_TOKEN` and `N8N_ADMIN_SHARED_TOKEN` are checked against
the values the n8n workflows actually send, by comparing digests; `GOOGLE_CLIENT_ID`'s
digest matches the client id hard-coded in `PRS - TEMPLATE - 99_Tool -
Agendamento`, which is what makes a token minted by `google-calendar-callback`
refreshable by that workflow -- a different OAuth client would have issued
tokens it could not redeem. `EMAIL_API_URL` is correctly absent: it exists
only to point tests at a mock.

Re-run the command above when this section is more than a few months old; a
list of intended secrets ages into fiction faster than the code does.

## How this was produced

`npm run env:check` (`scripts/check-env-inventory.mjs`) walks every
`.ts`/`.tsx` file under `supabase/functions/` for `Deno.env.get(...)` calls
and compares the result against the table above in both directions, in CI on
every push. This file can still drift out of sync with an unmerged change,
but it cannot drift silently past a merge.
