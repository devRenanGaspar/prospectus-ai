# Contributing

This is a solo project. Pull requests are self-reviewed against the PR
template checklist before merge; CI (`verify`) is the enforced gate — there is
no second reviewer.

## Development setup

1. Use Node 22.16.0 and npm 10.
2. Run `npm ci`.
3. Copy `.env.example` to `.env` and use a non-production Supabase project when
   the change writes data.
4. Run `npm run check` before opening a pull request.

## Change workflow

- Create a short-lived branch from `main`.
- Keep commits focused and describe user-visible or operational impact.
- Open a pull request; direct changes to `main` are not part of the supported
  workflow.
- Include screenshots for visual changes and a rollback note for database,
  authentication, billing, or integration changes.
- Never commit customer data, database dumps, credentials, `.env` files, or
  local tool configuration.

Database changes must follow
[`docs/database-change-checklist.md`](docs/database-change-checklist.md).

## Definition of done

- CI passes with no lint warnings.
- New behavior has tests at the lowest useful layer.
- Security and tenant-isolation implications were reviewed.
- Documentation and `.env.example` were updated when contracts changed.
- Cloudflare preview was smoke-tested before merge.
