# Deploy and Rollback Runbook

## Frontend release

1. Confirm `CI / verify` and the Cloudflare preview pass on the pull request.
2. Smoke-test login, dashboard navigation and the changed flow in preview.
3. Merge to `main`; Cloudflare Pages builds production from that commit.
4. Verify the production homepage, authentication and one read-only dashboard
   request.
5. Record the deployed commit in the release or incident notes.

If the frontend is unhealthy, use Cloudflare Pages to roll production back to
the last known-good deployment, then revert or fix the source through a pull
request. Do not repair production by editing generated `dist` files.

## Database release

1. Follow [`../database-change-checklist.md`](../database-change-checklist.md).
2. Apply backward-compatible database changes before code that depends on them.
3. Keep destructive cleanup in a later release after old callers are gone.
4. Verify migration history, grants and the user-visible behavior.

Database rollback is a reviewed forward migration. For a security incident,
prefer immediately revoking the affected grant or disabling the caller, then
ship the permanent migration.

## Edge Functions and integrations

- Confirm each function's `verify_jwt` setting and its in-function authentication
  contract before deploy.
- Test shared-token, service-role and end-user JWT paths separately.
- Rotate a compromised secret in Supabase/n8n first, then update dependent
  services and invalidate the old value.
- Never print tokens, authorization headers or customer payloads in release logs.

## Incident minimum record

- start/end time and customer impact;
- affected commit, migration or function version;
- detection signal and mitigation;
- data-integrity verification;
- follow-up owner and due date.
