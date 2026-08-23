# 0001 — No retrieval-augmented generation

## Status

Accepted (current behavior, reaffirmed 2026-08-14 when the README was
rewritten).

## Context

Both LLM-dependent stages — cold-copy generation and the SDR agent's
conversation — need context about the lead: business name, reviews, rating,
site and Instagram presence, and (for the agent) FAQ-style knowledge about the
agency's own offer. The obvious default for "give an LLM knowledge about an
entity" is RAG: embed a corpus, retrieve the top-k chunks, stuff them into the
prompt.

The actual data here doesn't fit that shape. Everything the copy stage needs
is already sitting in named columns on the `leads` row (`reviews_count`,
`total_score`, `website`, `instagram`, scraped site/Instagram summaries) —
there's no unstructured corpus to chunk and no ambiguity about which document
is relevant to which lead. The agent's "knowledge base" tool
(`BaseConhecimento`) reads a single FAQ text file per tenant and hands the
whole thing to the model in one call; there's no vector search step, no
similarity ranking, nothing retrieved.

## Decision

Do not build a retrieval layer. Assemble context by direct, keyed lookups
(one row per lead, one FAQ per tenant) and pass it inline in the prompt. Call
this what it is — direct lookups — rather than describing it as RAG, which
would overstate the architecture to anyone reading about it later.

## Consequences

- Simpler system: no embedding pipeline, no vector store, no re-indexing job,
  nothing to keep in sync.
- Ceiling on this approach: it works because per-tenant knowledge is small
  (one FAQ document) and per-lead context is structured (a database row). If
  a tenant's knowledge base grows past what fits in a single prompt, or a
  future feature needs semantic search over unstructured text, this decision
  will need revisiting — nothing here precludes adding retrieval later, it's
  just not needed at current scale.
- Documented explicitly in the README's Architecture section so a reader
  doesn't have to infer it: "There is no retrieval or vector search anywhere
  in this system... Calling that RAG would be inaccurate."
