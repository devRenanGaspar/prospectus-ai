import { env } from "./env";
import { getAgentMessagesSince, type MessageRow } from "./db";
import { didNodeRun, executedNodes, getExecution, listExecutions, sendAsLead, type ExecutionDetail } from "./n8n";
import { waitUntil } from "./wait";

/**
 * Driving the WhatsApp conversation as if we were the lead, and reading what
 * the agent did about it.
 *
 * Timing, measured from the workflows rather than guessed: `SETUP` debounces
 * incoming messages for 40 seconds before the agent even starts, then adds a
 * few seconds of waits, then the LLM turn itself. One turn lands around 1-2
 * minutes. The 6-minute default below is roughly 3x the worst case seen.
 */
const TURN_TIMEOUT_MS = 6 * 60 * 1000;

export interface Turn {
  /** What the lead said. */
  sent: string;
  /** Everything the agent said back, oldest first. */
  replies: string[];
  /** Instant just before sending, for scoping later queries. */
  since: Date;
}

/** Sends a message as the lead and waits for the agent's reply. */
export async function say(text: string, label = "agent-reply"): Promise<Turn> {
  // Identify replies by id, not by "newer than the moment I sent".
  //
  // A timestamp cutoff looked sufficient and is not. The previous turn's reply
  // can land a fraction of a second after this turn's cutoff is taken — the
  // agent debounces for 40 seconds, so turns overlap — and then the wait
  // resolves instantly against a message that answers the PREVIOUS question.
  // Observed: two consecutive turns reported the identical reply text, one of
  // them "satisfied after 0s". An assertion downstream would then be reading an
  // answer to a question the test had not asked yet.
  const seen = new Set((await getAgentMessagesSince(env.leadId, EPOCH)).map((m) => m.id));
  const since = new Date();
  console.log(`[lead] → ${text}`);
  await sendAsLead(text);

  await waitUntil<MessageRow[]>(
    label,
    async (observe) => {
      const rows = await getAgentMessagesSince(env.leadId, EPOCH);
      const fresh = rows.filter((m) => !seen.has(m.id));
      observe(`${fresh.length} new agent message(s) (${rows.length} total)`);
      return fresh.length > 0 ? fresh : null;
    },
    { timeoutMs: TURN_TIMEOUT_MS, intervalMs: 10_000 },
  );

  // The agent splits long answers into several WhatsApp messages, three seconds
  // apart. Returning as soon as the first arrives would truncate the answer and
  // make the FAQ assertions fail on a correct reply, so let the rest land.
  await new Promise((r) => setTimeout(r, 12_000));
  const settled = (await getAgentMessagesSince(env.leadId, EPOCH)).filter((m) => !seen.has(m.id));
  const texts = settled.map((m) => m.content ?? "");
  for (const t of texts) console.log(`[agent] ← ${t}`);

  return { sent: text, replies: texts, since };
}

/** Far enough back to mean "every message this lead has". */
const EPOCH = new Date(0);

/**
 * Sends a message and asserts the agent did not REPLY TO THE LEAD.
 *
 * "Did not reply" cannot be read from `public.messages`. When the agent
 * classifies a message as a bot it still runs, still produces an answer, and
 * `Insert Message on Lead System1` still records that answer — the suppression
 * happens further down, at `If TempLock_BotMsg not OFF`, which routes to a dead
 * end instead of to the send function. So a row with `sender = 'AI'` proves the
 * agent *composed* something, not that the lead *received* it.
 *
 * The signal that means delivery is `99_Send_Message_Function` appearing in the
 * agent execution. Its absence, plus `Saída mensagem BOT` present, is the
 * suppression working — and both are binary facts rather than interpretations.
 */
export async function sayAndExpectNoDelivery(
  text: string,
  label = "expect-no-delivery",
): Promise<{ since: Date; execution: ExecutionDetail; composed: string[] }> {
  const since = new Date();
  console.log(`[lead] → ${text}`);
  await sendAsLead(text);

  // Wait for the agent's run to finish rather than for a fixed window: the run
  // reaching a terminal state IS the moment the decision was made.
  const execution = await waitUntil(
    label,
    async (observe) => {
      const runs = await listExecutions(env.workflows.sdrAgent, { since, limit: 50 });
      for (const run of runs) {
        const detail = await getExecution(run.id);
        const nodes = executedNodes(detail);
        // Only the run that reached the agent counts; the workflow also fires
        // short executions that filter out early.
        if (!nodes.includes("AI Agent")) continue;
        observe(`execution ${run.id} reached the agent, status ${detail.status}`);
        if (detail.status === "running" || detail.status === "new") return null;
        return detail;
      }
      observe(`${runs.length} execution(s), none reached the agent yet`);
      return null;
    },
    { timeoutMs: TURN_TIMEOUT_MS, intervalMs: 10_000 },
  );

  const nodes = executedNodes(execution);
  const sent = nodes.some((n) => n.startsWith("99_Send_Message_Function"));
  if (sent) {
    const composed = await getAgentMessagesSince(env.leadId, since);
    throw new Error(
      `[${label}] the agent REPLIED to the lead — the send function ran.\n` +
        `  It said: ${composed.map((m) => m.content).join(" | ")}`,
    );
  }

  const composed = (await getAgentMessagesSince(env.leadId, since)).map((m) => m.content ?? "");
  console.log(
    `[${label}] no delivery. Suppressed at "${nodes.find((n) => n === "Saída mensagem BOT") ?? "(unknown gate)"}". ` +
      `The agent still composed and recorded: ${composed.join(" | ") || "(nothing)"}`,
  );

  return { since, execution, composed };
}

/**
 * The companion to `sayAndExpectSilence`: proves the agent workflow ran at all.
 *
 * Without this, "the agent correctly ignored a bot message" is indistinguishable
 * from "n8n was down", and the bot test would pass while the product was broken.
 */
export async function assertAgentActuallyRan(since: Date): Promise<void> {
  const executions = await waitUntil(
    "agent-executed",
    async (observe) => {
      const runs = await listExecutions(env.workflows.sdrAgent, { since, limit: 50 });
      observe(`${runs.length} execution(s) since ${since.toISOString()}`);
      return runs.length > 0 ? runs : null;
    },
    { timeoutMs: 2 * 60 * 1000, intervalMs: 10_000 },
  );

  console.log(
    `[agent-executed] ${executions.length} execution(s) of the SDR agent — ` +
      `silence was a decision, not an outage`,
  );
}

/** Did any execution of `workflowId` since `since` run the named node? */
export async function anyExecutionRanNode(
  workflowId: string,
  nodeName: string,
  since: Date,
): Promise<boolean> {
  const runs = await listExecutions(workflowId, { since, limit: 50 });
  for (const run of runs) {
    const detail = await getExecution(run.id);
    if (didNodeRun(detail, nodeName)) return true;
  }
  return false;
}

/**
 * Whether any of the agent's tools fired since `since`.
 *
 * This is the suite's strongest form of behavioural assertion. "The agent
 * proposed a meeting" is checked as "the VerificarHorarios tool ran", not as
 * "the word reunião appeared" — tool calls are binary, and prose is not. It
 * also survives the agent rewording itself, which an LLM does constantly.
 */
export async function toolsUsedSince(since: Date): Promise<Set<string>> {
  const used = new Set<string>();
  const runs = await listExecutions(env.workflows.sdrAgent, { since, limit: 50 });
  for (const run of runs) {
    const detail = await getExecution(run.id);
    for (const node of Object.keys(detail.data?.resultData?.runData ?? {})) {
      used.add(node);
    }
  }
  return used;
}

/** The agent's tool nodes, by the names they carry in the workflow. */
export const AGENT_TOOLS = {
  knowledgeBase: "BaseConhecimento",
  checkAvailability: "VerificarHorarios",
  bookMeeting: "AgendarReuniao",
  callHuman: "chamar_humano",
  botAlert: "Alerta_Bot",
  notInterested: "Lead_Sem_interesse",
} as const;

// ---------------------------------------------------------------------------
// Text helpers — deliberately lenient, and never the only evidence
// ---------------------------------------------------------------------------

const NEGATIONS = ["não", "nao", "nunca", "nem", "sem"];

/**
 * Whether `text` asserts `term`, ignoring negated occurrences.
 *
 * A naive `/fazemos/` matches "não fazemos gestão de marketplace" — which is
 * the *correct* answer to an out-of-scope question. Failing the test on that
 * would push someone to reword the agent's prompt to satisfy a regex, which is
 * worse than having no test.
 */
export function assertsAffirmatively(text: string, term: string): boolean {
  const haystack = text.toLowerCase();
  const needle = term.toLowerCase();
  let from = 0;

  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return false;
    const before = haystack.slice(Math.max(0, at - 40), at);
    const words = before.split(/[^a-zà-ú]+/).filter(Boolean).slice(-3);
    if (!words.some((w) => NEGATIONS.includes(w))) return true;
    from = at + needle.length;
  }
}

/** Portuguese stopwords, for the FAQ overlap check. */
const STOPWORDS = new Set([
  "para", "com", "que", "dos", "das", "uma", "dele", "pelo", "pela", "mais",
  "como", "onde", "quando", "porque", "então", "isso", "esse", "essa", "seus",
  "suas", "nossa", "nosso", "você", "vocês", "pode", "podem", "tem", "temos",
  "está", "estão", "ser", "sao", "são", "não", "nao", "sim", "por", "sobre",
]);

/**
 * Fraction of the FAQ answer's distinctive terms that appear in the agent's
 * reply. The agent rephrases rather than quoting, so exact matching is useless
 * and overlap is the workable proxy.
 */
export function faqOverlap(agentReply: string, faqAnswer: string): number {
  const terms = new Set(
    faqAnswer
      .toLowerCase()
      .split(/[^a-zà-ú0-9]+/)
      .filter((w) => w.length >= 5 && !STOPWORDS.has(w)),
  );
  if (terms.size === 0) return 1;
  const reply = agentReply.toLowerCase();
  let hits = 0;
  for (const term of terms) if (reply.includes(term)) hits += 1;
  return hits / terms.size;
}
