# Database Change Checklist

## Before writing SQL

- Identify affected tables, roles, policies, functions, triggers and Edge
  Functions.
- Confirm the backward-compatible rollout order for database, frontend and n8n.
- Create the migration with `supabase migration new <descriptive_name>`.
- Never place customer data or generated identifiers in a migration.

## SQL review

- Every table in an exposed schema has RLS enabled.
- Grants and RLS policies are both explicit; neither substitutes for the other.
- Ownership checks use `(select auth.uid())` and indexed ownership columns.
- Update policies contain appropriate `USING` and `WITH CHECK` expressions.
- Views use `security_invoker = true` or are not exposed.
- `SECURITY DEFINER` functions set a safe `search_path`, perform explicit caller
  authorization, and revoke `EXECUTE` from roles that do not need the API.
- Foreign-key columns used by joins or cascades have an appropriate index.
- Lock order is documented for multi-row transactional functions.

## Production rollout

1. Run `supabase db push --linked --dry-run` and review the exact file list.
2. Confirm backup/rollback readiness and current migration parity.
3. Apply only reviewed, committed migrations.
4. Verify behavior with a read-only query or controlled transaction.
5. Confirm migration parity and rerun both Supabase advisors.
6. Regenerate TypeScript types when the exposed schema changed.

Use a new forward migration to roll back database behavior. Never rewrite a
migration that may already have run in another environment.

That rule protects SQL statements, not the file's prose. A migration's
comments may be edited after the fact when a diff of the statements alone
(comments stripped from both revisions) proves nothing executable changed —
translating a comment or correcting what it claims is comment-only
maintenance, not a rewrite of database history.
