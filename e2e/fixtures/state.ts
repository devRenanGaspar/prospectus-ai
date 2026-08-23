import { env } from "./env";
import {
  assertTestLead,
  clearAgentMemory,
  countLeadsInStatus,
  countLeadsWithPhone,
  deleteTestLeadMessagesExceptFirst,
  getLead,
  getMessages,
  getTenantAgentState,
  setTenantAgentOn,
  updateTestLead,
} from "./db";

/**
 * Setup and teardown for the fixed test lead.
 *
 * The rule this file exists to enforce: **every test produces the state it
 * needs, and never inherits it from the test before.** TESTE 1 needs the lead
 * in COPY_READY and leaves it in SENT; the conversation tests need SENT. If
 * either relied on what the previous run left behind, the suite would pass once
 * and fail on the second run — which defeats "one command, no manual steps".
 */

/** Placeholder copy, used only if the fixed lead somehow has none. */
const FALLBACK_COPY =
  "Mensagem de teste automatizado do harness E2E. " +
  "Este lead existe apenas para validar o fluxo do sistema.";

async function assertPhoneIsUnique(): Promise<void> {
  const count = await countLeadsWithPhone(env.leadPhone);
  if (count !== 1) {
    throw new Error(
      `${count} leads carry phone ${env.leadPhone}; exactly 1 is required.\n` +
        `Both "Find Lead" nodes in n8n filter by phone and require count == 1. ` +
        `With any other number the SDR agent and the reply scorer stop working ` +
        `silently — every execution still reports success. Fix the duplicate ` +
        `before running the suite.`,
    );
  }
}

/**
 * State the agent keeps outside Postgres, which the harness cannot reach.
 *
 * `<phone>_<agent>_Trava` is a Redis lock with a 300s TTL, set while a turn is
 * in flight and cleared at the end. A run that aborted mid-turn can leave it
 * set, and the next run's first message would be swallowed. There is no Redis
 * credential in the harness, so the only honest handling is to wait it out.
 */
async function waitOutStaleLock(): Promise<void> {
  // The proxy for "a turn may still be in flight" is the timestamp of the last
  // message in the conversation, not `leads.updated_at` — the latter moves for
  // reasons unrelated to the agent (a status change, a phone edit) and would
  // make this sleep for no reason.
  const messages = await getMessages(env.leadId);
  const last = messages[messages.length - 1]?.timestamp;
  if (!last) return;

  const LOCK_TTL_MS = 300_000;
  const sinceLastTurn = Date.now() - new Date(last).getTime();
  if (sinceLastTurn >= LOCK_TTL_MS) return;

  const waitMs = LOCK_TTL_MS - sinceLastTurn;
  console.log(
    `[setup] last conversation activity was ${Math.round(sinceLastTurn / 1000)}s ago; ` +
      `waiting ${Math.round(waitMs / 1000)}s for the n8n Redis lock (TTL 300s) to expire. ` +
      `The harness has no Redis credential, so waiting is the only way to clear it.`,
  );
  await new Promise((r) => setTimeout(r, waitMs));
}

/** Everything both setups share. */
async function resetConversationState(): Promise<void> {
  await assertTestLead();
  await assertPhoneIsUnique();

  const deleted = await deleteTestLeadMessagesExceptFirst();
  await clearAgentMemory();

  await updateTestLead({
    lead_replied: null,
    lead_reply_score: null,
    ai_agent_enabled: true,
  });
  await setTenantAgentOn();

  const remaining = await getMessages(env.leadId);
  console.log(
    `[setup] cleaned: ${deleted} message(s) deleted, ${remaining.length} kept, ` +
      `agent memory cleared, lead_replied/score reset, agent re-enabled`,
  );
}

/**
 * Setup for TESTE 1.
 *
 * Puts the fixed lead in COPY_READY with non-empty copy, because the test drags
 * it from "Copy Pronta" into "Enviar Mensagem". The copy's *content* is not
 * what TESTE 1 validates — generation is validated on the two freshly searched
 * leads — so a placeholder is acceptable when the lead has none.
 */
export async function setupForColdFlow(): Promise<void> {
  await resetConversationState();

  const lead = await getLead(env.leadId);
  const patch: Record<string, unknown> = { status: "COPY_READY" };
  if (!lead.mensagem_abordagem_comercial?.trim()) {
    patch.mensagem_abordagem_comercial = FALLBACK_COPY;
    console.log("[setup] fixed lead had no copy; filled a placeholder");
  }
  await updateTestLead(patch);

  // The send queue delivers at most one lead per account per cycle. A lead
  // queued by something else would take the slot and TESTE 1 would time out
  // blaming the product.
  const queued = await countLeadsInStatus(env.userId, "SEND_PENDING");
  const generating = await countLeadsInStatus(env.userId, "COPY_PENDING");
  if (queued > 0 || generating > 0) {
    throw new Error(
      `Account has ${queued} lead(s) in SEND_PENDING and ${generating} in COPY_PENDING. ` +
        `The send queue delivers one lead per account per cycle, so a pre-existing ` +
        `queued lead would consume the slot this test is waiting for. Let them drain first.`,
    );
  }

  // No lock wait here: TESTE 1 never drives a conversation turn, so the Redis
  // lock cannot be in the way, and sleeping up to five minutes for it would be
  // pure waste at the front of the slowest test in the suite.
  console.log("[setup] cold-flow ready: lead in COPY_READY, queues empty");
}

/** Setup for TESTES 2 to 5. The conversation starts from a delivered message. */
export async function setupForConversation(): Promise<void> {
  await resetConversationState();
  await updateTestLead({ status: "SENT" });
  await waitOutStaleLock();

  const agentState = await getTenantAgentState();
  if (agentState !== "ON") {
    throw new Error(
      `crm agent_on_off is "${agentState}" after setup, expected "ON". ` +
        `The SETUP workflow routes to DESLIGADO when it is OFF and the agent never replies.`,
    );
  }
  console.log("[setup] conversation ready: lead in SENT, agent ON at both levels");
}

/**
 * Turns the agent back on after a hand-off to a human switched it off.
 *
 * `chamar_humano` sets `crm.agent_on_off = 'OFF'`, and it is right to: once a
 * person takes over, the bot must stop talking. A test that asks an
 * out-of-scope question and then keeps the conversation going has to undo that
 * deliberately, and say so, rather than sit through a six-minute timeout
 * wondering why a correctly-behaving agent went quiet.
 */
export async function resumeAfterHandoff(): Promise<boolean> {
  const state = await getTenantAgentState();
  if (state === "ON") return false;

  console.log(
    `[state] the agent is ${state} — a hand-off to a human switched it off, which is correct. ` +
      `Turning it back on so the test can exercise the next phase.`,
  );
  await setTenantAgentOn();
  return true;
}

/**
 * Between-test cleanup.
 *
 * Same operations as setup, deliberately: the suite is safe to interrupt, and a
 * test that dies halfway must not poison the next one. What this does NOT cover
 * is listed in e2e/README.md — the Redis keys `UltMsgUser` and `UltMsgAgente`
 * have no TTL and no credential reaches them.
 */
export async function cleanup(): Promise<void> {
  await resetConversationState();
  await updateTestLead({ status: "SENT" });
}
