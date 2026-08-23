# Architecture decision records

Real decisions made in this codebase, written down after the fact from git
history, migrations and code — not a process this project ran in real time.
Each one exists because the decision has a genuine trade-off worth explaining
to someone reading the code cold, not because every change deserves a
document.

| ADR | Decision |
|---|---|
| [0001](0001-no-retrieval-augmented-generation.md) | No retrieval-augmented generation anywhere in the pipeline |
| [0002](0002-atomic-charge-rpcs.md) | Charge and state transition happen in one `SECURITY DEFINER` RPC, not client-side |
| [0003](0003-asymmetric-model-fallback.md) | Copy generation gets cross-provider fallback; the SDR agent gets same-provider retry only |
| [0004](0004-pull-based-send-queue.md) | Sending is polled by n8n, not pushed, to rate-limit WhatsApp |
| [0005](0005-force-cutover-without-full-migration.md) | Forced the n8n/Supabase cutover without migrating historical conversation state |
| [0006](0006-vault-shared-tokens-for-cron.md) | `pg_cron`-triggered functions authenticate via a Vault-backed shared token, not a service-role key |
