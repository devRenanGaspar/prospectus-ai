# Frontend Observability

Phase 3B instruments the browser without collecting customer identity, content
or raw diagnostic payloads. Telemetry is best-effort and must never block or
degrade the product journey.

## Signals

| Event | Purpose | Stored detail |
|---|---|---|
| `frontend.web_vital` | Real-user performance | metric, official rating, sanitized route and millisecond duration when the metric is time-based |
| `frontend.javascript_error` | Client reliability | stable error code and sanitized route; never message, filename, URL or stack |
| `frontend.navigation` | Denominator by route | sanitized route template and navigation type |

Core Web Vitals are collected with the `web-vitals` library. LCP and INP are
the current Core Web Vitals; FCP and TTFB are collected as supporting loading
diagnostics. CLS is not a duration, so this version records its official rating
but deliberately does not place its numeric value in `duration_ms`. A future
schema extension is required before storing an exact CLS value.

Dynamic lead paths become `/leads/:leadId`; unknown paths become `/not-found`.
Query strings, fragments and route identifiers are discarded before enqueueing.

## Privacy and resilience

- The browser session ID is a random UUID stored in `sessionStorage`; it is not
  an authentication user ID and expires with the browser session.
- The Edge Function verifies that a real Supabase user session is active, but
  never persists that user ID with telemetry.
- Only explicit event, route, error-code and attribute allowlists are accepted.
- JavaScript errors are deduplicated by code and route for 30 seconds.
- The browser sends at most 60 events per page load, in batches of at most 10,
  with at most three attempts. Each active Edge Function isolate also applies
  defensive caps of 60 events per session and 120 events per authenticated
  caller per minute; the caller ID is kept only in ephemeral memory.
- Collection failures are silent and do not affect application behavior.
- Events are persisted only when a valid user session exists at send time;
  signed-out signals are discarded after bounded retries.

### The analytics consent gate

The user can turn this collector off, from **Configurações › Privacidade**. The
switch writes `profiles.lgpd_consents.analytics`, and
`<TelemetryConsentGate />` — mounted inside `<AuthProvider>` — pushes the answer
into `setTelemetryConsent()`.

Three states, not a boolean, because of *when* the collector starts:
`startFrontendObservability()` runs in `main.tsx` before React mounts, and
`<FrontendRouteObserver />` is deliberately outside the provider, so events are
already queued before any profile can be read.

| State | Meaning |
|---|---|
| `unknown` | The session or profile has not resolved. Events keep queueing and **nothing is sent** — this is a hold, not a drop |
| `granted` | Signed out, or the profile says analytics is allowed (including never answered). The held queue drains |
| `denied` | The profile says no. The queue is discarded and nothing further is recorded |

Sign-out returns the gate to `unknown`, so a new session re-evaluates.

The switch is scoped to the application and its label says so: the public
marketing pages load Google Tag Manager before anyone signs in, so no logged-in
control can govern it. That measurement is disclosed in section 7 of the privacy
policy instead.

## Configuration and deployment order

Merging to `main` deploys every edge function, including `frontend-telemetry`
— the `deploy-functions` job in `.github/workflows/ci.yml` runs on every push
to `main` with no per-function list. So steps 1 and 2 below are prerequisites
of the merge, not of a later manual deploy: the function 503s without its
secret, and the schema has to exist before anything writes to it.

1. Apply the already-reviewed observability schema migration.
2. Set `OBSERVABILITY_ALLOWED_ORIGINS` as a private, comma-separated Edge
   Function secret. Never commit the real list.
3. Merge, which deploys `frontend-telemetry` with JWT verification enabled
   (`verify_jwt` comes from `supabase/config.toml`).
4. Configure `VITE_OBSERVABILITY_SAMPLE_RATE` in the hosting environment.
   The default is `1` (100%) for initial calibration.
5. Optionally set sanitized `VITE_APP_RELEASE` and `VITE_APP_BUILD` identifiers.
6. Deploy the frontend and confirm only allowlisted events appear.

If the allowed-origin secret is absent, the function fails closed with 503. If
the caller is signed out or the JWT is invalid, it returns 401. Neither response
is shown to the end user.

## Validation

Unit tests cover route sanitization, categorical CLS handling, batching/retry
limits, server-side payload validation, PII-key rejection, mixed-session
rejection and duplicate event IDs. Production smoke testing is deferred until
the migration, secret and Edge Function are explicitly deployed.
