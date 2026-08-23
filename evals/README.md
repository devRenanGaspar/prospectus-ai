# Evals

Offline evaluation harnesses for the LLM-dependent stages of the pipeline. See
[docs/eval-report.md](../docs/eval-report.md) for what's covered, what isn't,
and what this actually found.

## copy-grounding

Ports the 9 grounding checks that already run in production against real
generated copy (`public.ops_copy_quality`, defined in
`supabase/migrations/20260811130000_copy_quality_grounding.sql` and
`20260811235840_copy_quality_group_b.sql`) into plain JS, and runs them
against a small set of synthetic lead + copy fixtures instead of the
database.

```bash
npm run eval
```

`checks.mjs` is a manual, best-effort port of the SQL — the SQL views remain
the source of truth for what actually runs against production data. This
exists to make the checks testable without a database and to give prompt or
regex changes something to run against before they reach production, which is
the gap called out in the main README's "Evaluation and testing" section.

`fixtures.mjs` is entirely synthetic: no real business name, lead, or review
appears anywhere in this directory.

This is a seed, not a gold set. It has one or two fixtures per check, mostly
isolating a single failure mode; it does not attempt to cover the full space
of what a real generated message can say, and it says nothing about
conversational quality, tone, or whether a message would actually convert —
only whether it's grounded in the lead's own data. Growing it with harder,
more varied fixtures (and eventually with graded real output, redacted) is
the top item on the main README's roadmap.
