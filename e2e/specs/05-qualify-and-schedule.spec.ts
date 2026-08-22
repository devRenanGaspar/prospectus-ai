import { expect, test } from "@playwright/test";
import { env } from "../fixtures/env";
import { AGENT_TOOLS, say, toolsUsedSince } from "../fixtures/conversation";
import { getExecution, listExecutions } from "../fixtures/n8n";
import { cleanup, setupForConversation } from "../fixtures/state";

/**
 * TESTE 5 — a qualified lead gets a meeting, on a real calendar.
 *
 * The most expensive test in the suite and the only one with a side effect that
 * outlives it: it books an actual Google Calendar event. Nothing here deletes
 * it — the harness has no Calendar credential and the authorisation for this
 * suite does not extend to Google.
 *
 * The n8n inspection at the end is the point of the whole exercise. Checking
 * `status === "success"` alone is what let a workflow write to a decommissioned
 * database for weeks with ~100k green executions. A silent error IS a success
 * whose output is empty or wrong, so the assertions read the node's output.
 */

/**
 * Positive answers to all three Bloco 1 questions, in order.
 *
 * Two positives are enough to qualify, but the prompt says the agent "pode
 * encerrar o processo de qualificação" — *may* end it, not must. So an agent
 * that asks the third question after two positives is following its
 * instructions, and a test demanding a meeting proposal after exactly two
 * fails on correct behaviour. Observed: it asked about budget as question
 * three. The test therefore answers up to all three and records where the
 * proposal actually came.
 */
const POSITIVE_QUALIFICATION = [
  "Sim, já invisto em tráfego pago há mais de um ano.",
  "Meu objetivo é escalar, o negócio vai bem e quero crescer mais.",
  "Posso investir uns 5 mil por mês em mídia, tranquilo.",
];

test("TESTE 5 — qualification, meeting proposal and booking", async () => {
  await setupForConversation();

  // --- 1. qualify ----------------------------------------------------------
  const qualificationSince = new Date();
  let lastReply = "";
  let proposedAfter = 0;

  for (const [index, answer] of POSITIVE_QUALIFICATION.entries()) {
    const turn = await say(answer, `qualification-positive-${index + 1}`);
    lastReply = turn.replies.join(" ");

    // "It proposes a meeting" is asserted as "the availability tool ran", never
    // as a keyword in the text: the tool call is binary and the wording is not.
    const tools = await toolsUsedSince(qualificationSince);
    if (tools.has(AGENT_TOOLS.checkAvailability)) {
      proposedAfter = index + 1;
      break;
    }
  }

  expect(
    proposedAfter,
    `The agent never checked availability, even after answering all ` +
      `${POSITIVE_QUALIFICATION.length} qualification questions positively.\n` +
      `Last reply: ${lastReply}`,
  ).toBeGreaterThan(0);

  console.log(
    `[teste5] qualified and proposed a meeting after ${proposedAfter} positive answer(s)` +
      (proposedAfter > 2
        ? " — note the prompt allows qualifying at 2, so this is later than the spec assumed"
        : "") +
      `: ${lastReply.slice(0, 200)}`,
  );

  // --- 2. ask for times ----------------------------------------------------
  // Deliberately NOT "do you have something tomorrow". The tool looks for the
  // next BUSINESS days, and a run on a Friday would ask about Saturday and get
  // nothing back — a calendar failure dressed up as a product failure.

  const offer = await say(
    "Perfeito, tenho interesse. Quais horários vocês têm disponíveis?",
    "availability",
  );
  const offerText = offer.replies.join(" ");

  // --- 3. the n8n side, checked by OUTPUT and not by status ----------------
  //
  // The window starts at the qualification, not at the question just asked:
  // the agent runs `VerificarHorarios` at the moment it decides to propose,
  // which is one or two turns EARLIER. Scoping to the last turn finds no
  // execution and reports a silent failure that did not happen.
  const slots = await readSchedulingToolOutput(qualificationSince, "VerificarHorarios");
  expect(
    slots,
    "No VerificarHorarios execution produced output. A green execution with nothing in it " +
      "is exactly the silent failure this test exists to catch.",
  ).not.toBeNull();
  console.log(`[teste5] VerificarHorarios returned: ${JSON.stringify(slots).slice(0, 400)}`);

  // --- 4. accept one of the offered times ---------------------------------
  // The slot comes from what the tool actually returned, never from a date the
  // test computed: the prompt forbids booking outside the returned options, so
  // inventing one would test the refusal path instead of the booking path.
  const chosen = pickOfferedSlot(slots, offerText);
  expect(
    chosen,
    `Could not find a concrete time to accept.\n  Tool output: ${JSON.stringify(slots).slice(0, 500)}\n` +
      `  Agent said: ${offerText}`,
  ).not.toBeNull();
  console.log(`[teste5] accepting "${chosen}"`);

  const bookingSince = new Date();
  await say(`Pode ser ${chosen}.`, "accept-slot");

  // The agent asks for an email before booking.
  const confirmation = await say(`Meu e-mail é ${env.leadEmail}`, "give-email");
  const confirmationText = confirmation.replies.join(" ");

  // --- 5. it really booked ------------------------------------------------
  const booking = await readSchedulingToolOutput(bookingSince, "AgendarReuniao");
  expect(
    booking,
    "No AgendarReuniao execution produced output — the booking did not happen, " +
      "however green the execution looks.",
  ).not.toBeNull();
  console.log(`[teste5] AgendarReuniao returned: ${JSON.stringify(booking).slice(0, 400)}`);

  const toolsAfterBooking = await toolsUsedSince(bookingSince);
  expect(
    toolsAfterBooking.has(AGENT_TOOLS.bookMeeting),
    "The agent never called AgendarReuniao after being given a time and an email",
  ).toBe(true);

  expect(
    /agendei|combinado|confirmad|marcad/i.test(confirmationText),
    `The agent booked but never confirmed it to the lead. It said: ${confirmationText}`,
  ).toBe(true);

  console.log(
    `[teste5] a REAL meeting now exists on ${env.leadEmail}'s invite and the account's ` +
      `Google Calendar. Nothing here deletes it — remove it by hand.`,
  );

  await cleanup();
});

/**
 * Reads what the scheduling sub-workflow actually produced.
 *
 * Returns null when no execution ran, or when one ran and produced nothing —
 * which is the shape a silent failure takes.
 */
async function readSchedulingToolOutput(since: Date, objetivo: string): Promise<unknown | null> {
  const runs = await listExecutions(env.workflows.schedulingTool, { since, limit: 20 });
  for (const run of runs) {
    const detail = await getExecution(run.id);
    const body = JSON.stringify(detail.data ?? {});
    if (!body.includes(objetivo)) continue;

    if (detail.status !== "success") {
      throw new Error(`${objetivo} execution ${run.id} ended as "${detail.status}"`);
    }

    // Read the node n8n itself reports as last, not the last key of `runData`.
    // Object key order is insertion order, which is not execution order, so
    // picking the final key lands on an arbitrary node — here the real terminal
    // node is `VerHor - Resp OK`, which carries the slot list.
    const runData = detail.data?.resultData?.runData ?? {};
    const last = (detail.data?.resultData as { lastNodeExecuted?: string } | undefined)
      ?.lastNodeExecuted;
    const runs_ = last ? (runData[last] as Record<string, unknown>[] | undefined) : undefined;
    const output = runs_?.at(-1);
    const json = (output as { data?: { main?: { json?: unknown }[][] } })?.data?.main?.[0]?.[0]?.json;

    if (json && Object.keys(json as object).length > 0) return json;
    console.warn(
      `[teste5] execution ${run.id} is green but its last node (${last}) produced nothing`,
    );
  }
  return null;
}

/**
 * Picks a time to accept, preferring the tool's structured output over the
 * agent's prose.
 */
function pickOfferedSlot(slots: unknown, agentText: string): string | null {
  // The tool answers with a human-readable list, e.g.
  //   "Horários disponíveis para agendamento:\n[\"24/08/2026 às 09:00\", …]"
  // so the first "DD/MM/YYYY às HH:MM" in its output is a slot it really
  // offered. Preferring this over the agent's prose matters because the prompt
  // forbids booking anything the tool did not return — a time parsed out of a
  // sentence could be one the agent improvised.
  const fromTool = JSON.stringify(slots ?? "").match(
    /(\d{1,2}\/\d{1,2}\/\d{4})\s*[àa]s\s*(\d{1,2}):(\d{2})/,
  );
  if (fromTool) return `${fromTool[1]} às ${fromTool[2]}:${fromTool[3]}`;

  // Fallbacks, in decreasing confidence: a dated time in the agent's message,
  // then a bare time.
  const dated = agentText.match(/(\d{1,2}\/\d{1,2}(?:\/\d{4})?)[^\d]{0,12}(\d{1,2})[:h](\d{2})/);
  if (dated) return `${dated[1]} às ${dated[2]}:${dated[3]}`;
  const timeOnly = agentText.match(/\b(\d{1,2})[:h](\d{2})\b/);
  if (timeOnly) return `${timeOnly[1]}:${timeOnly[2]}`;

  return null;
}
