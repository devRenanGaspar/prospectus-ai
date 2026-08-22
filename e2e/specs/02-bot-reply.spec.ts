import { expect, test } from "@playwright/test";
import { env } from "../fixtures/env";
import { getLead } from "../fixtures/db";
import { AGENT_TOOLS, sayAndExpectNoDelivery } from "../fixtures/conversation";
import { executedNodes, getExecution, inboundHubEvent, listExecutions } from "../fixtures/n8n";
import { cleanup, setupForConversation } from "../fixtures/state";

/**
 * TESTE 2 — an automated reply must not be answered.
 *
 * Replying to another bot is how a WhatsApp number gets itself banned: two
 * autoresponders talk until someone reports the account.
 *
 * The subtlety this test exists to respect: the agent does NOT stay silent
 * internally. It runs, it composes an answer, and that answer is written to the
 * lead's message history and shown in the CRM. What does not happen is the
 * send. So "the agent did not reply" has to be read from the workflow — the
 * send function absent, the bot gate taken — and never from `public.messages`.
 */

// Built from the literal examples in the reply scorer's own prompt, to give the
// classifier the clearest possible signal. If the agent answers even this, the
// guard is genuinely not working.
const BOT_MESSAGE =
  "Obrigado pela sua mensagem! No momento não podemos atender. " +
  "Nosso horário de atendimento é de segunda a sexta, das 9h às 18h. " +
  "Retornaremos o contato assim que possível.";

test("TESTE 2 — an automated reply is detected and never delivered", async () => {
  await setupForConversation();

  const before = await getLead(env.leadId);
  expect(before.lead_replied, "setup should have cleared lead_replied").toBeNull();

  const { since, execution, composed } = await sayAndExpectNoDelivery(BOT_MESSAGE, "bot-not-delivered");

  // Absence on its own also holds when n8n is down, the WhatsApp instance is
  // disconnected, or the lead lookup failed. `sayAndExpectNoDelivery` only
  // returns once an execution actually REACHED the agent, so reaching this line
  // already proves the system ran. Assert it explicitly anyway — it is the
  // difference between "correctly ignored" and "everything is broken".
  const nodes = executedNodes(execution);
  expect(nodes, "the agent node should have run").toContain("AI Agent");

  // Which guard fired matters. `Alerta_Bot` is the deliberate path; suppression
  // without it means something else stopped the send, which still passes but is
  // a different story and worth seeing in the log.
  if (nodes.includes(AGENT_TOOLS.botAlert)) {
    console.log("[teste2] Alerta_Bot fired — the agent classified the message as a bot");
  } else {
    console.warn(
      `[teste2] the reply was suppressed WITHOUT Alerta_Bot. Nodes: ${nodes.join(", ")}`,
    );
  }
  expect(nodes, "the bot gate should have routed to the dead end").toContain("Saída mensagem BOT");

  // Nothing may have reached the handset carrying the reply the agent just
  // composed. This is NOT "zero executions on the inbound hub" -- that hub
  // fires on every event on the lead-side WhatsApp instance, including
  // asynchronous delivery-receipt acks for messages OTHER tests sent well
  // before this one started. Observed: an ack for TESTE 1's send landed here
  // 15+ minutes after TESTE 1 actually sent it, long after TESTE 1 had
  // finished and TESTE 2 was already running -- a stale, unrelated event that
  // a bare "0 executions" check reads as "the bot reply leaked."
  //
  // What actually cannot happen is THIS turn's suppressed text reaching the
  // lead, so that is what gets matched: the content of every execution since
  // `since` against what the agent composed (and never should have sent).
  const composedText = composed.join(" ");
  const runsSinceSend = await listExecutions(env.workflows.inboundHub, { since, limit: 20 });
  const leaked: typeof runsSinceSend = [];
  for (const run of runsSinceSend) {
    const detail = await getExecution(run.id);
    const event = inboundHubEvent(detail);
    if (event?.content && composedText.includes(event.content.trim())) {
      leaked.push(run);
    }
  }
  expect(
    leaked.length,
    `${leaked.length} execution(s) on the inbound hub carried the bot-suppressed reply's own ` +
      `text -- it reached the handset after all. Composed text: ${composedText}`,
  ).toBe(0);

  // The scorer's own, independent guard: an automated message must not count as
  // the lead having replied, or the operator sees a fake engagement signal.
  const after = await getLead(env.leadId);
  expect(after.lead_replied, "an autoresponder must not mark the lead as having replied").toBeNull();
  expect(after.lead_reply_score, "no score should be assigned to an automated message").toBeNull();

  console.log(`[teste2] agent composed but withheld: ${composed.join(" | ")}`);
  await cleanup();
});
