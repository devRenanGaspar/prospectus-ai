import { expect, test } from "@playwright/test";
import { env } from "../fixtures/env";
import {
  countLeadsWithPhone,
  getCreditsBalance,
  getFaq,
  getLead,
  getTenantAgentState,
} from "../fixtures/db";
import { getWorkflow, listExecutions, getExecution, publishedNodes, sendAsLead } from "../fixtures/n8n";
import { waitUntil } from "../fixtures/wait";

/**
 * Runs before anything is spent.
 *
 * Every check here failed for real at least once while this suite was being
 * built. They exist because each one, left unchecked, produces a failure five
 * steps later that looks like a product defect and is not.
 */

test.describe.configure({ mode: "serial" });

test.describe("preflight", () => {
  test("credentials reach all three systems", async () => {
    // Supabase, as service_role
    const lead = await getLead(env.leadId);
    expect(lead.id).toBe(env.leadId);

    // n8n REST. The 401 here is the single most likely first failure: a key
    // from any other n8n instance is well-formed and still rejected, and the
    // editor host (nned…) is not the webhook host (nnwb…).
    const workflow = await getWorkflow(env.workflows.sdrAgent);
    expect(workflow.id).toBe(env.workflows.sdrAgent);
    expect(workflow.active).toBe(true);
  });

  test("no live workflow writes to the decommissioned Supabase project", async () => {
    // The defect this guards against produced ~100k executions reporting
    // success while writing to a database nobody reads. Comparing draft to
    // published version is NOT enough on its own — a wrong configuration can be
    // published, and then both agree and both are wrong. So the substantive
    // check is on the nodes that are actually running.
    const critical = [
      env.workflows.sdrAgent,
      env.workflows.replyScorer,
      env.workflows.schedulingTool,
      env.workflows.sendQueue,
      env.workflows.copyGeneration,
      env.workflows.setup,
      env.workflows.testSender,
    ];

    for (const id of critical) {
      const workflow = await getWorkflow(id);
      const running = JSON.stringify(publishedNodes(workflow));

      expect(
        running.includes(env.deadProjectRef),
        `${workflow.name} [${id}] is running against the decommissioned project ` +
          `${env.deadProjectRef}. Its executions will report success and write nowhere useful.`,
      ).toBe(false);

      if (workflow.versionId && workflow.activeVersionId) {
        expect(
          workflow.versionId,
          `${workflow.name} [${id}] has an unpublished draft. The version you see ` +
            `in the editor is not the version that runs.`,
        ).toBe(workflow.activeVersionId);
      }
    }
  });

  test("the SDR agent has one prompt, with no per-account branch", async () => {
    // Until 2026-08-14 this workflow carried a second agent node and an IF that
    // routed this very account to it, with different qualification criteria.
    // It was removed deliberately. If it ever comes back, the scripts in TESTE
    // 4 and 5 would be talking to a different agent than the one they were
    // written against — and would fail for a reason that is not a defect.
    const workflow = await getWorkflow(env.workflows.sdrAgent);
    const nodes = publishedNodes(workflow);

    const agents = nodes.filter((n) => n.type === "@n8n/n8n-nodes-langchain.agent");
    expect(
      agents.length,
      `Expected exactly 1 agent node, found ${agents.length}: ${agents.map((a) => a.name).join(", ")}`,
    ).toBe(1);

    const routesByUser = nodes.filter(
      (n) =>
        (n.type === "n8n-nodes-base.if" || n.type === "n8n-nodes-base.switch") &&
        JSON.stringify(n.parameters ?? {}).includes(env.userId),
    );
    expect(
      routesByUser.map((n) => n.name),
      "A node branches on the test account's user_id — the suite may be exercising a different prompt",
    ).toEqual([]);
  });

  test("the live prompt still matches what the scripts assume", async () => {
    // TESTE 4 and 5 depend on the qualification rules, and those live in the
    // agent's system prompt rather than in any table. Reading them here means a
    // prompt edit fails the run at the door, naming the divergence, instead of
    // failing an assertion five turns into a conversation.
    const workflow = await getWorkflow(env.workflows.sdrAgent);
    const agent = publishedNodes(workflow).find(
      (n) => n.type === "@n8n/n8n-nodes-langchain.agent",
    );
    const prompt = JSON.stringify(agent?.parameters ?? {});

    const expectations: [string, string][] = [
      ["BLOCO 1", "the qualification blocks are still named BLOCO 1 / BLOCO 2"],
      ["pelo menos 2 respostas positivas", "2 positives out of 3 still qualifies (TESTE 5)"],
      ["nenhuma resposta positiva", "0 positives still disqualifies (TESTE 4)"],
      ["Alerta_Bot", "the bot-detection tool is still called Alerta_Bot (TESTE 2)"],
      ["VerificarHorarios", "the availability tool name is unchanged (TESTE 5)"],
      ["AgendarReuniao", "the booking tool name is unchanged (TESTE 5)"],
      ["BaseConhecimento", "the FAQ tool name is unchanged (TESTE 4)"],
    ];

    for (const [needle, why] of expectations) {
      expect(prompt.includes(needle), `Prompt no longer contains "${needle}" — ${why}`).toBe(true);
    }
  });

  test("the test-sender workflow forwards the payload", async () => {
    // This one sends a real WhatsApp message. It is worth it: the workflow used
    // to ignore its payload entirely (a non-empty literal on the left of `||`
    // is always truthy, so the rest of the chain was unreachable) and every one
    // of TESTES 2-5 would have silently driven the conversation with the wrong
    // text.
    const marker = `E2E-PREFLIGHT-${Date.now()}`;
    const since = new Date();
    await sendAsLead(`Teste automatizado, ignore. ${marker}`);

    // Wait for the execution carrying our marker to reach a TERMINAL status.
    // Matching on the marker alone returns while the run is still "running",
    // and asserting on that snapshot fails against a perfectly healthy send.
    const TERMINAL = new Set(["success", "error", "crashed", "canceled"]);
    const found = await waitUntil(
      "preflight-marker",
      async (observe) => {
        const runs = await listExecutions(env.workflows.testSender, { since, limit: 10 });
        for (const run of runs) {
          const detail = await getExecution(run.id);
          if (!JSON.stringify(detail.data ?? {}).includes(marker)) continue;
          observe(`execution ${run.id} carries the marker, status "${detail.status}"`);
          if (TERMINAL.has(detail.status)) return detail;
          return null;
        }
        observe(`marker not seen yet in ${runs.length} sender execution(s)`);
        return null;
      },
      { timeoutMs: 90_000, intervalMs: 5_000 },
    );

    expect(
      found.status,
      "The sender ran but did not finish cleanly — the lead-side messages in TESTES 2-5 would not be delivered",
    ).toBe("success");

    // The marker is a real inbound message, so `Verifica Resposta` scores it
    // like any other reply -- concurrently, with `waitForSubWorkflow: false`.
    // Nothing about "Teste automatizado, ignore. E2E-..." matches the
    // autoresponder patterns it screens for, so the LLM is free to call it
    // genuine and write `lead_replied` / `status` on the FIXED lead.
    //
    // That write is not synchronous with the sender confirming delivery above
    // -- it lands independently, and was observed landing ~50s after send.
    // Left unguarded, TESTE 1's setup can reset the lead to COPY_READY and
    // then have this write land seconds later and silently flip it back to
    // IN_CONVERSATION, deep inside a 15-minute search wait where nothing is
    // watching for it. Waiting here for the scorer to reach a terminal state
    // makes this test's own side effect finish before the suite moves on, so
    // whatever setup runs next is guaranteed to write last.
    const scored = await waitUntil(
      "preflight-marker-scored",
      async (observe) => {
        const runs = await listExecutions(env.workflows.replyScorer, { since, limit: 10 });
        for (const run of runs) {
          const detail = await getExecution(run.id);
          if (!JSON.stringify(detail.data ?? {}).includes(marker)) continue;
          observe(`scorer execution ${run.id} carries the marker, status "${detail.status}"`);
          if (TERMINAL.has(detail.status)) return detail;
          return null;
        }
        observe(`marker not seen yet in ${runs.length} scorer execution(s)`);
        return null;
      },
      { timeoutMs: 90_000, intervalMs: 5_000 },
    );
    console.log(`[preflight] reply scorer settled on the marker: ${scored.status}`);
  });

  test("the account and the fixed lead are in a runnable state", async () => {
    // Exactly one lead may carry the test phone. Both "Find Lead" nodes filter
    // by phone and require count == 1; with two, the agent and the reply scorer
    // stop working and every execution still reports success.
    expect(await countLeadsWithPhone(env.leadPhone)).toBe(1);

    const lead = await getLead(env.leadId);
    expect(lead.user_id).toBe(env.userId);
    expect(lead.phone).toBe(env.leadPhone);

    // A full run costs roughly 23 credits. 50 leaves room for a retry.
    const credits = await getCreditsBalance(env.userId);
    expect(credits, `Only ${credits} credits left; a run needs ~23`).toBeGreaterThan(50);

    // TESTE 4 reads the FAQ from the profile rather than hardcoding answers, so
    // that editing the FAQ updates the test instead of breaking it.
    const faq = await getFaq(env.userId);
    expect(faq.length, "The account has no FAQ entries; TESTE 4 has nothing to ask about").toBeGreaterThanOrEqual(2);

    // Not asserted, only reported: setup turns this back ON, and it is normal
    // for it to be OFF beforehand.
    console.log(`[preflight] tenant agent_on_off is currently "${await getTenantAgentState()}"`);
  });
});
