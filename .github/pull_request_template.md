This is a solo project. PRs are self-reviewed against this checklist before
merge; CI (`verify`) is the enforced gate.

## Summary

Describe the user or operational outcome.

## Validation

- [ ] `npm run check`
- [ ] Cloudflare preview smoke-tested when UI or routing changed
- [ ] Tests added or updated for changed behavior
- [ ] No secrets, customer data, dumps or local-only files are included
- [ ] Auth, RLS, admin, billing and tenant-isolation impact reviewed, or not applicable
- [ ] Database checklist completed, or no database change

## Evidence

Add screenshots, test output or migration/advisor results as appropriate.
