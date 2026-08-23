import { expect, test } from "@playwright/test";
import { env } from "../fixtures/env";
import { getLead } from "../fixtures/db";
import { say } from "../fixtures/conversation";
import { cleanup, setupForConversation } from "../fixtures/state";
import { waitUntil } from "../fixtures/wait";

/**
 * TESTE 3 — a genuine, interested reply is scored and recorded.
 *
 * This is the test that was impossible to pass until the reply scorer was
 * republished: its live version wrote `lead_replied` to the decommissioned
 * Supabase project, so the marking never reached production while every
 * execution reported success.
 */

const INTERESTED_REPLY =
  "Oi! Achei muito interessante a proposta. Já invisto em tráfego hoje e quero escalar. " +
  "Como funciona o trabalho de vocês? Podemos conversar?";

test("TESTE 3 — a genuine reply is marked and scored", async () => {
  await setupForConversation();

  const before = await getLead(env.leadId);
  expect(before.lead_replied).toBeNull();

  const turn = await say(INTERESTED_REPLY, "genuine-reply");
  expect(turn.replies.length, "the agent should answer a genuine message").toBeGreaterThan(0);

  // The agent's answer and the scorer's write are CONCURRENT, not sequential:
  // the SDR workflow calls `Verifica Resposta` with `waitForSubWorkflow: false`.
  // Reading `lead_replied` the moment the reply lands is a race, and on a
  // healthy system it loses often enough to make the suite look flaky.
  const scored = await waitUntil(
    "reply-scored",
    async (observe) => {
      const lead = await getLead(env.leadId);
      observe(
        `lead_replied=${lead.lead_replied} score=${lead.lead_reply_score} status=${lead.status}`,
      );
      const ready =
        lead.lead_replied === "X" &&
        lead.lead_reply_score !== null &&
        lead.status === "IN_CONVERSATION";
      return ready ? lead : null;
    },
    { timeoutMs: 4 * 60 * 1000, intervalMs: 10_000 },
  );

  // `lead_reply_score` is stored as text; compare as a number.
  const score = Number(scored.lead_reply_score);
  expect(Number.isFinite(score), `score "${scored.lead_reply_score}" is not numeric`).toBe(true);

  // The scorer's own scale: 0-2 uninterested, 3-5 generic, 6-8 moderate
  // interest, 9-10 high. The message above asks a question AND proposes a next
  // step, which the scale puts at 9-10. Requiring >= 6 leaves a full band of
  // slack for LLM variance while still failing on anything that reads the
  // message as disinterested or generic.
  expect(score, `expected interest >= 6 on the prompt's own 0-10 scale, got ${score}`).toBeGreaterThanOrEqual(6);
  console.log(`[teste3] scored ${score}/10, status ${scored.status}`);

  await cleanup();
});
