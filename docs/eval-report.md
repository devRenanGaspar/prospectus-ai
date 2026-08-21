# Eval report — copy grounding

Companion to [evals/README.md](../evals/README.md). This is the first entry;
it will grow as more of the pipeline gets an offline harness.

## What was built

`evals/copy-grounding/` ports the 9 grounding checks that already run daily
against production copy (`ops_copy_quality`) into plain JS, and runs them
against 12 synthetic fixtures — no database, no LLM call, runs in under a
second (`npm run eval`). The same fixtures are asserted in CI via
`src/test/copy-grounding-checks.test.ts`.

This is a narrow tool: it validates that the *grounding heuristics* correctly
classify a given piece of text against a given lead's known data. It says
nothing about whether a message is well-written, on-brand, or likely to get a
reply — see [Limitations](#limitations) below.

## Result

```
Copy grounding eval — 12 fixtures, 9 checks

PASS  clean-no-claims
PASS  clean-true-negative
PASS  reviews-inflated            → reviews_superestimado
PASS  rating-inflated             → nota_superestimada
PASS  false-perfect-rating        → nota_maxima_indevida
PASS  reviewer-fabricated         → avaliador_inexistente
PASS  pixel-denied-without-analysis → pixel_sem_analise
PASS  site-denied-but-exists      → nega_site_existente
PASS  instagram-denied-but-exists → nega_instagram_existente
PASS  unhappy-reviewer-named      → avaliador_insatisfeito_citado
PASS  guarantee-language          → linguagem_garantia_indevida
PASS  stacked-violations          → reviews_superestimado, linguagem_garantia_indevida

12/12 fixtures matched their expected violations.
```

That result is the *second* run. The first run, against fixtures written in
plain natural Portuguese, failed two of them.

## What it found

`nega_site_existente` and `nega_instagram_existente` (and, more narrowly,
`pixel_sem_analise`) match copy of the form "vocês não têm site" — except the
production regex only matched the singular `tem`/`possui`, not the plural
agreement `têm`/`possuem` that "vocês" actually calls for in correct
Portuguese. A fixture written the way an LLM is more likely to actually phrase
it — "vocês não têm site", not "vocês não tem site" — passed straight through
the gate that exists specifically to catch it.

This wasn't a synthetic near-miss found only in the fixture: rerunning the
(now-fixed) check against real production copy changed the counts immediately —

| Check | Before | After |
|---|---|---|
| `nega_site_existente` | 2 / 2 (universe) | 12 / 12 |
| `pixel_sem_analise` | 254 / 615 | 273 / 655 |
| `nega_instagram_existente` | 0 / 0 | 0 / 0 |

`nega_site_existente` alone had been undercounting by 10 real violations —
83% of the true count — since the check shipped on 2026-08-11. Fixed in
`supabase/migrations/20260817003458_copy_quality_verb_agreement.sql`, applied
the same night this eval harness was built. The offline port and the fixture
that exposed the gap were written *before* the fix, against the original
regex; `checks.mjs` was only updated to match afterward, so the harness
genuinely caught this rather than being written to already agree with the
fix.

## Limitations

- **12 fixtures, mostly one violation each.** This proves the checks fire and
  don't false-positive on the cases tested; it is not remotely exhaustive
  against the space of things a generation prompt could produce.
- **Grounding only, not quality.** Nothing here checks tone, persuasiveness,
  message length, or whether a human would find the message credible — see
  `copy-quality` in `src/test/` for the small amount of dashboard-level logic
  that is tested, and the main README's honest gap: there is still no offline,
  graded set of leads with expected messages for the generation stage itself.
- **A manual port, not a shared implementation.** `checks.mjs` and the SQL in
  `ops_copy_quality` are two independent implementations of the same intent.
  They can drift again the same way `tem`/`têm` did, in either direction, and
  nothing currently detects that automatically. Comparing the eval's output
  against a live sample of `ops_copy_quality` periodically would close that;
  it isn't built yet.
- **No LLM in the loop.** This only exercises the deterministic grounding
  checks, not the model that generates the copy in the first place. Building
  that eval — sampling real prompts, generating output, and scoring it against
  a held-out expectation — is the actual top item on the roadmap; this is a
  smaller, already-useful step toward it.
