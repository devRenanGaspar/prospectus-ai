# Orchestration

The automation layer (lead sourcing, copy generation, sending, the SDR agent)
runs as n8n workflows, edited through n8n's UI. README roadmap item #7 calls
this out as a real gap: workflows aren't version-controlled, drafts diverge
from published versions, and none of it lives in this repository.

This directory is a first, partial step, not that gap closed.

## What's here and why it's not a raw export

A literal export of a live workflow's JSON was considered and deliberately
not done. n8n workflow JSON for this system embeds things that don't belong
in a public repository even redacted line-by-line by hand: credential
references, internal instance hostnames, and — most consequential — the
actual prompt text, which the main README already states plainly is kept out
of this repository (see "Language"). A redaction pass over a real export is
also the kind of task where a single missed field is a real leak, not a
cosmetic mistake, and that risk isn't worth taking for a portfolio artifact.

What's here instead is hand-authored from direct inspection of the live
workflow (node names, types, and the connection graph — read, not run), with
every credential, host, phone number and prompt body deliberately left out.
It documents structure and control flow, the same level of detail the main
README's own architecture diagram gives each stage as a single box, one level
deeper for the most complex one.

- [`sdr-agent-workflow.md`](sdr-agent-workflow.md) — the WhatsApp SDR agent's
  node graph: trigger, gating, the agent call itself and its tools, and the
  parallel fan-out that runs after a reply.

## Limitations

- **Manually maintained.** This will drift from the live workflow the same
  way any hand-written doc drifts from code — there's no automated check
  tying it to what's actually published in n8n.
- **One workflow.** Only the SDR agent's conversation path is documented
  here. Lead sourcing, copy generation and sending are not, and there are two
  near-duplicate versions of the SDR agent workflow in production (the main
  one and a template used for new tenants) — this describes the shape both
  share, not either one's exact current node count.
- **No prompts, no credentials, no parameter values.** Deliberately. What
  each node *does* is documented; what it's configured with is not.
