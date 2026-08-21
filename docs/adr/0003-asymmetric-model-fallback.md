# 0003 — Asymmetric model fallback: copy generation vs. the SDR agent

## Status

Accepted (current behavior; agent-side retry added 2026-08-16).

## Context

Two different LLM-dependent stages, two different failure profiles.

Copy generation is a single-turn, single-purpose call: given a lead's data,
write one opening message. It runs *after* the customer's credits have
already been debited (see [0002](0002-atomic-charge-rpcs.md)), so a failed
generation is money spent with nothing delivered — `ops_stuck_copy_requests`
exists specifically to catch this class of failure, and the August 2026
incident ([0005](0005-force-cutover-without-full-migration.md)) is a real
example of 191 leads stuck this way.

The SDR agent is a multi-turn, tool-calling conversation: it holds Postgres
memory, calls calendar/knowledge-base/lookup tools mid-conversation, and a
human is waiting on the other end of a WhatsApp thread. Swapping its
provider mid-conversation isn't a clean retry — it would mean re-running a
tool-calling agent loop against a different model with different tool-calling
behavior, memory handling, and prompt sensitivity, while tools it already
called (e.g. booking a calendar slot) aren't safe to call again.

An earlier attempt at agent-side resilience *did* duplicate the agent node
(a second `AI Agent1` node with its own copy of the prompt and tools, routed
to one hardcoded tenant) — not for fallback, but for a prompt experiment. The
two prompts drifted (`.item` vs `.first()` paired-item resolution), and the
duplicated node shipped a bug where the agent introduced itself with an empty
name for that tenant. That incident is the concrete reason duplicating the
agent node is treated as a known-risky pattern here, not just a hypothetical
concern.

## Decision

- **Copy generation**: real cross-provider fallback. If Anthropic fails, the
  same prompt retries against OpenAI. Justified by the fact that money is
  already spent by the time this call happens.
- **SDR agent**: same-provider retry only (`retryOnFail: true, maxTries: 3,
  waitBetweenTries: 5000` on the model node, added 2026-08-16), not
  cross-provider fallback. This absorbs transient failures (rate limits,
  blips) without touching the agent's topology. Cross-provider fallback for
  the agent is a deliberately deferred gap, not an oversight — the only
  available implementation pattern (duplicate the agent node) is the same
  pattern that already caused a real prompt-drift bug once.

## Consequences

- A sustained OpenAI outage still silently stalls live agent conversations —
  this is accepted as an open, documented limitation (README roadmap #2), not
  solved by this decision.
- If cross-provider agent fallback is built later, it should not be a
  duplicated node with its own copy of the prompt and tools. A safer shape
  would keep one prompt as the single source of truth and vary only the model
  binding — e.g. a provider-agnostic tool-calling wrapper, or (if n8n's
  LangChain agent node ever supports it natively) a single node with a model
  list and built-in fallback, rather than two independently-edited copies of
  the same 13,000+ character prompt.
