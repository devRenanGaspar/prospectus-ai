import { expect, test } from "@playwright/test";
import { env } from "../fixtures/env";
import {
  getAgentMessagesSince,
  getCreditsBalance,
  getExpectedSearchCategory,
  getLatestSearch,
  getLead,
  getLeadsBySearch,
  countLeadsWithPhone,
} from "../fixtures/db";
import { findSendFailureReason, getExecution, listExecutions } from "../fixtures/n8n";
import { setupForColdFlow } from "../fixtures/state";
import { expectCardInColumn, expectLeadDetailShowsCopy, gotoBoard, login, moveLeads, searchLeads } from "../fixtures/ui";
import { waitUntil } from "../fixtures/wait";

/**
 * TESTE 1 — the cold pipeline: search → copy → send → delivered on WhatsApp.
 *
 * The two freshly searched leads validate search and copy generation. From the
 * phone swap onward the test continues on the FIXED lead only, because both
 * "Find Lead" nodes in n8n require exactly one lead per phone — giving the test
 * phone to a second lead breaks the SDR agent and the reply scorer silently,
 * with every execution still reporting success.
 */

const INFRA_TIMEOUT_MS = 35 * 60 * 1000;

test("TESTE 1 — cold flow: search, copy, send, delivery", async ({ page }) => {
  const { nicheLabel, leadCategory } = await getExpectedSearchCategory(env.userId);
  console.log(`[teste1] niche "${nicheLabel}" — expecting category_name "${leadCategory}"`);

  await setupForColdFlow();

  const t0 = new Date();
  const creditsBefore = await getCreditsBalance(env.userId);
  console.log(`[teste1] starting with ${creditsBefore} credits`);

  await login(page);
  await gotoBoard(page);

  // --- 1. search two leads -------------------------------------------------
  await searchLeads(page, { quantity: env.search.quantity });

  const search = await waitUntil(
    "search-registered",
    async (observe) => {
      const row = await getLatestSearch(env.userId, t0);
      observe(row ? `search ${row.id} status=${row.status}` : "no search row yet");
      return row;
    },
    { timeoutMs: 60_000, intervalMs: 3_000 },
  );
  console.log(`[teste1] search_id ${search.id}`);

  // `search_id` is the only deterministic handle: the board already holds 46
  // leads in NEW, so "the new ones" cannot be identified from the screen.
  const found = await waitUntil(
    "search-completed",
    async (observe) => {
      const current = await getLatestSearch(env.userId, t0);
      if (current?.refunded_at) {
        throw new Error(`Search ${search.id} was refunded — it failed upstream, not here.`);
      }
      const leads = await getLeadsBySearch(search.id);
      observe(`status=${current?.status} leads_found=${current?.leads_found} rows=${leads.length}`);
      return leads.length >= env.search.quantity ? leads : null;
    },
    { timeoutMs: INFRA_TIMEOUT_MS },
  );

  const newLeadIds = found.slice(0, env.search.quantity).map((l) => l.id);
  console.log(`[teste1] ${found.length} lead(s): ${newLeadIds.join(", ")}`);

  // --- 2. they show up on the board ---------------------------------------
  // The board updates over a Supabase realtime subscription rather than by
  // polling, so a reload is the reliable way to observe backend-driven changes.
  await page.reload();
  await gotoBoard(page);
  for (const id of newLeadIds) {
    await expectCardInColumn(page, id, "NEW");
  }

  // --- 3. country, and what can honestly be said about the category --------
  // Country is asserted in the database rather than on screen: the app has no
  // country field at all (the location picker is Brazil-only by design) and the
  // card does not render the category either.
  for (const lead of found.slice(0, env.search.quantity)) {
    expect(lead.country, `lead ${lead.id} country`).toBe(env.search.expectedCountry);
  }

  // The category cannot be asserted against the PRINCIPAL niche, for two
  // reasons that took two runs to see clearly.
  //
  // First, a search is not scoped to one niche. The account configures a
  // principal, a secondary and an alternative, and the search draws from all
  // three: with this account's ICP, one run came back with "Serviços jurídicos"
  // and "Advogado" (principal → lawyer) and the next with "dental_clinic" and
  // "Dentista" (secondary → dental_clinic). Both are correct behaviour.
  //
  // Second, nothing links a lead back to the niche that produced it —
  // `lead_searches` stores only quantity and limits — and `category_name` is
  // free text from Google Places with several spellings per niche (the slug,
  // plus one or more pt-BR display names).
  //
  // So the assertion is that every lead came back with SOME category, the
  // values are logged for a human to read, and the configured niches are logged
  // beside them. Making this strict needs the niche persisted on the search
  // first — an app change, not a test change.
  for (const lead of found.slice(0, env.search.quantity)) {
    expect(
      (lead.category_name ?? "").trim().length,
      `lead ${lead.id} came back with no category at all`,
    ).toBeGreaterThan(0);
  }
  console.log(
    `[teste1] principal niche "${nicheLabel}" (slug "${leadCategory}"); ` +
      `categories returned: ${found
        .slice(0, env.search.quantity)
        .map((l) => `"${l.category_name}"`)
        .join(", ")} — a search covers the principal, secondary and alternative niches`,
  );

  // --- 4. generate copy for both ------------------------------------------
  // Explicit selection, never the "Preparar Copy de Todos" button in the header
  // — that one would fire a generation for all 46 leads sitting in the column.
  await moveLeads(page, { from: "NEW", to: "COPY_PENDING", leadIds: newLeadIds });

  const withCopy = await waitUntil(
    "copy-ready",
    async (observe) => {
      const leads = await getLeadsBySearch(search.id);
      const target = leads.filter((l) => newLeadIds.includes(l.id));
      const ready = target.filter(
        (l) => l.status === "COPY_READY" && (l.mensagem_abordagem_comercial ?? "").trim().length > 0,
      );
      observe(target.map((l) => `${l.id.slice(0, 8)}=${l.status}`).join(" "));
      return ready.length === newLeadIds.length ? ready : null;
    },
    { timeoutMs: INFRA_TIMEOUT_MS },
  );

  // --- 5. the copy is really there ----------------------------------------
  await page.reload();
  await gotoBoard(page);
  for (const id of newLeadIds) {
    await expectCardInColumn(page, id, "COPY_READY");
  }

  // The board card never renders the copy — only the detail page does, reading
  // `mensagem_abordagem_comercial`. So "the copy shows on the card" is checked
  // as: the card moved to Copy Pronta, and the detail page shows the text.
  const generated = withCopy[0].mensagem_abordagem_comercial ?? "";
  expect(generated.length, "the generated copy is suspiciously short").toBeGreaterThan(20);
  await expectLeadDetailShowsCopy(page, withCopy[0].id, generated);
  console.log(`[teste1] copy rendered (${generated.length} chars): ${generated.slice(0, 120)}…`);

  // --- 6. from here on, only the fixed lead --------------------------------
  const fixed = await getLead(env.leadId);
  expect(fixed.phone, "the fixed lead must carry the test phone").toBe(env.leadPhone);
  expect(
    await countLeadsWithPhone(env.leadPhone),
    "exactly one lead may carry the test phone, or the agent and scorer break silently",
  ).toBe(1);
  expect(fixed.status, "setupForColdFlow should have left the fixed lead in COPY_READY").toBe("COPY_READY");

  // --- 7. send ------------------------------------------------------------
  await page.reload();
  await gotoBoard(page);
  await moveLeads(page, { from: "COPY_READY", to: "SEND_PENDING", leadIds: [env.leadId] });

  // There is no way to force the queue. The workflow's webhook exists but is
  // wired to nothing, so posting to it returns 200 and does nothing at all —
  // only the 15-minute schedule actually sends. So the test waits it out.
  const sendQueuedAt = new Date();
  console.log("[teste1] queued; the send fires on the 15-minute schedule (no manual trigger exists)");

  await waitUntil(
    "message-sent",
    async (observe) => {
      const lead = await getLead(env.leadId);
      observe(`status=${lead.status}`);

      // A failed send does not stop at "not sent yet": the workflow moves the
      // lead to CLOSED_LOST and the n8n execution still reports success. Detect
      // that terminal state immediately and report Evolution's actual error,
      // instead of sitting here for 35 minutes waiting for a status that will
      // never arrive.
      if (lead.status === "CLOSED_LOST") {
        const reason = await findSendFailureReason(sendQueuedAt);
        throw new Error(
          `The send failed and the lead was marked CLOSED_LOST — which reads as "the lead was ` +
            `lost", though no message ever left. The credit was still charged.\n` +
            `Evolution said: ${reason ?? "(no failing send node found in recent executions)"}`,
        );
      }
      return lead.status === "SENT" ? lead : null;
    },
    { timeoutMs: INFRA_TIMEOUT_MS },
  );

  // --- 8. it actually reached WhatsApp ------------------------------------
  // Two independent pieces of evidence. The database row proves the system
  // recorded a send; the n8n execution on the inbound hub proves a message
  // really travelled to the test handset.
  const recorded = await waitUntil(
    "message-recorded",
    async (observe) => {
      const rows = await getAgentMessagesSince(env.leadId, t0);
      observe(`${rows.length} outbound message(s) recorded`);
      return rows.length > 0 ? rows : null;
    },
    { timeoutMs: 5 * 60 * 1000 },
  );
  console.log(`[teste1] recorded: ${recorded[recorded.length - 1].content?.slice(0, 120)}…`);

  const delivered = await waitUntil(
    "delivered-to-handset",
    async (observe) => {
      const runs = await listExecutions(env.workflows.inboundHub, { since: t0, limit: 50 });
      observe(`${runs.length} inbound-hub execution(s) since the run started`);
      for (const run of runs) {
        const detail = await getExecution(run.id);
        if (JSON.stringify(detail.data ?? {}).includes(env.agentPhone)) return detail;
      }
      return null;
    },
    { timeoutMs: 5 * 60 * 1000 },
  );
  expect(delivered.status).toBe("success");

  const creditsAfter = await getCreditsBalance(env.userId);
  console.log(`[teste1] credits ${creditsBefore} → ${creditsAfter} (spent ${creditsBefore - creditsAfter})`);
});
