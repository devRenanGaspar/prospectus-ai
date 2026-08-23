# End-to-end suite

On-demand Playwright tests that drive the whole product against **production**:
the real app, the real Supabase project, the real n8n workflows, real WhatsApp
messages through Evolution, and a real Google Calendar.

This is not a CI job. It is not scheduled. It costs money every time it runs.

## Why it exists

Most of what Prospectus does happens outside this repository — a lead search,
a copy generation and an entire SDR conversation live in n8n workflows and LLM
prompts. Unit tests cannot see any of it, and neither can a code review. The
only way to know the pipeline still works end to end is to run it end to end.

## Running it

```bash
npm run e2e                                   # everything, in order
npm run e2e -- --grep "TESTE 3"               # one test
npx playwright test --config e2e/playwright.config.ts 00-preflight
```

Always let `00-preflight` run first. It is cheap — one WhatsApp message — and
every check in it exists because that check failing produces a confusing
failure several minutes and several credits later.

## Setup

Copy the template to the repository root and fill in three secrets:

```bash
cp e2e/.env.example .env.e2e
```

| Variable | Where to get it |
|---|---|
| `E2E_APP_PASSWORD` | the test account's password in the app |
| `E2E_SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API Keys → `service_role` |
| `E2E_N8N_API_KEY` | the n8n **editor** host → Settings → n8n API |

Everything else — hosts, workflow ids, the fixed test lead — lives in
`e2e/fixtures/env.ts`, because none of it is secret and pinning it in code is
what makes a run reproducible.

Two traps worth naming, because both cost an hour the first time:

- **The n8n editor host is not the webhook host.** The webhook host serves
  `/webhook/*` and `/healthz` and returns 404 for `/api/v1`; it has no editor
  and no API. A key generated on any other n8n instance is well-formed and
  still returns 401 here.
- **`service_role` bypasses RLS entirely.** The write helpers in
  `fixtures/db.ts` take no target parameter and re-check the lead's id, phone
  and owner before touching a row, so there is no call site that could point
  them somewhere else. Keep it that way.

## What a run costs

Per full run, roughly: 2 credits for the search, 6 for copy, 1 for the send,
and 1 per conversation turn — about 23 credits. On top of that, real money:
Google Places for the lead search, OpenAI for copy generation and for every
agent turn, and Evolution for the WhatsApp traffic.

`TESTE 5` books a **real meeting** on the account's Google Calendar. Nothing
deletes it — the harness has no Calendar credential and its authorisation does
not extend to Google. Delete those by hand.

`TESTE 1` creates two new leads on the account every run, and they stay. The
rule for this system is that nothing gets deleted from the database, and the
narrow exception granted to this suite covers only the fixed test lead's own
rows.

## The tests

| Spec | What it proves |
|---|---|
| `00-preflight` | credentials work; no live workflow writes to the decommissioned project; the agent has one prompt with no per-account branch; the live prompt still matches what the scripts assume; the test sender forwards its payload; the account is runnable |
| `01-cold-flow` | search → leads on the board → copy generated and rendered → queued → sent → delivered to the handset |
| `02-bot-reply` | an autoresponder is detected, not answered, and does not count as a reply |
| `03-positive-reply` | a genuine reply is marked and scored |
| `04-faq-and-disqualify` | FAQ questions are answered from the FAQ, an out-of-scope question is not invented, a lead answering everything negatively gets no meeting |
| `05-qualify-and-schedule` | two positive answers qualify, the agent proposes times, and a meeting is really booked |

## Rules the suite follows

**Assert behaviour, not wording.** Everything after `TESTE 1` is LLM output.
"The agent proposed a meeting" is checked as "the `VerificarHorarios` tool
ran", never as "the word *reunião* appeared". Tool calls are binary; prose is
not, and the agent rewords itself constantly.

**A green execution is not a passing check.** A workflow spent weeks writing
to a decommissioned database with every execution reporting `success`. A silent
failure *is* a success whose output is empty or wrong, so the n8n assertions
read the node's output rather than its status.

**Absence needs a companion.** "The agent did not reply" also holds when n8n is
down. `02-bot-reply` therefore also asserts that the agent *ran* — otherwise it
would go green against a completely broken system.

**Never ban a word the correct answer might use.** A regex for `fazemos`
matches "não fazemos gestão de marketplace", which is the right answer. Text
checks skip negated occurrences and are warnings, never the deciding evidence.

**Every test produces the state it needs.** No test inherits state from the one
before, which is also why any of them can run alone with `--grep`.

**One waiting primitive.** Every long wait goes through `waitUntil` in
`fixtures/wait.ts`. It logs each probe, and on timeout reports the last value it
observed — without that, a 35-minute timeout tells you only that 35 minutes
went by.

## What the cleanup does not cover

Between tests the suite deletes the fixed lead's messages (keeping the first),
clears the agent's Postgres conversation memory, resets the reply flags, and
re-enables the agent at both the lead and tenant level.

It does **not** touch Redis, because no credential in this harness reaches it:

| Key | Handling |
|---|---|
| `<phone>_<agent>_Trava` | TTL 300s — the conversation setup waits it out |
| `<agent>_<phone>_TempLock_BotMsg` | TTL 20s — expires on its own |
| `<phone>_<agent>_UltMsgUser` / `UltMsgAgente` | **no TTL, never cleared** |

The last row is real residual risk. Those keys feed a check that suppresses a
duplicate answer, so the mitigation is that every scripted message is textually
distinct. Two runs sending identical text could see the second one ignored.

## Known limits

**The requested niche cannot be verified against the leads returned.** A search
covers the account's principal, secondary and alternative niches at once, and
nothing links a lead back to the one that produced it — `lead_searches` records
quantity and limits only. `category_name` is free text from Google Places with
several spellings per niche. `01-cold-flow` therefore asserts that a category
came back and logs the values next to the configured niches, rather than
pretending to an equality that would fail on healthy runs. Making it strict
requires persisting the niche on the search first.

**There is no way to force the send queue.** The send workflow exposes a
webhook, but that node has no outgoing connection: posting to it returns 200 and
records an execution that runs one node and stops. Only the 15-minute schedule
sends, so `01-cold-flow` waits for it.

**Timing is wide.** A lead search has finished in 72 seconds and taken 15
minutes. Each waiting step has a 35-minute ceiling and `01-cold-flow` has three
of them in sequence, which is why the per-test budget is 115 minutes.
