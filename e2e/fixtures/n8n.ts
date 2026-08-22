import { env } from "./env";

/**
 * Minimal n8n REST client.
 *
 * Two hosts, and mixing them up costs an hour: `n8nApiUrl` (nned…) serves the
 * editor and `/api/v1`; `n8nWebhookUrl` (nnwb…) is a webhook processor that
 * serves `/webhook/*` and `/healthz` and returns 404 for everything else.
 */
async function api<T>(path: string): Promise<T> {
  const response = await fetch(`${env.n8nApiUrl}/api/v1${path}`, {
    headers: { "X-N8N-API-KEY": env.n8nApiKey, accept: "application/json" },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `n8n GET ${path} -> HTTP ${response.status}. ${body.slice(0, 200)}` +
        (response.status === 401
          ? " (the API key is not accepted by this instance — regenerate it on the editor host)"
          : ""),
    );
  }
  return response.json() as Promise<T>;
}

export interface ExecutionSummary {
  id: number | string;
  workflowId: string;
  status: string;
  startedAt: string;
  stoppedAt: string | null;
}

export async function listExecutions(
  workflowId: string,
  opts: { limit?: number; since?: Date } = {},
): Promise<ExecutionSummary[]> {
  const query = new URLSearchParams({
    workflowId,
    limit: String(opts.limit ?? 20),
  });
  const page = await api<{ data: ExecutionSummary[] }>(`/executions?${query}`);
  const rows = page.data ?? [];
  if (!opts.since) return rows;
  const cutoff = opts.since.getTime();
  return rows.filter((e) => new Date(e.startedAt).getTime() >= cutoff);
}

export interface ExecutionDetail {
  id: number | string;
  status: string;
  startedAt: string;
  data?: { resultData?: { runData?: Record<string, unknown[]> } };
}

export async function getExecution(id: number | string): Promise<ExecutionDetail> {
  return api<ExecutionDetail>(`/executions/${id}?includeData=true`);
}

/** Node names that actually ran in an execution. */
export function executedNodes(execution: ExecutionDetail): string[] {
  return Object.keys(execution.data?.resultData?.runData ?? {});
}

/**
 * Whether a named node ran. This is how the suite asserts agent behaviour:
 * "proposed a meeting" means `VerificarHorarios` ran, not that some Portuguese
 * word appeared in a sentence. Tool calls are binary; prose is not.
 */
export function didNodeRun(execution: ExecutionDetail, nodeName: string): boolean {
  return Object.prototype.hasOwnProperty.call(
    execution.data?.resultData?.runData ?? {},
    nodeName,
  );
}

/** Raw output of a node, for inspecting what a "successful" execution produced. */
export function nodeOutput(execution: ExecutionDetail, nodeName: string): unknown {
  const runs = execution.data?.resultData?.runData?.[nodeName];
  if (!Array.isArray(runs) || runs.length === 0) return null;
  return runs[runs.length - 1];
}

// ---------------------------------------------------------------------------
// Workflow definitions — used by the preflight guards
// ---------------------------------------------------------------------------

export interface WorkflowDetail {
  id: string;
  name: string;
  active: boolean;
  versionId?: string;
  activeVersionId?: string;
  nodes: { name: string; type: string; parameters?: unknown }[];
  activeVersion?: { nodes: { name: string; type: string; parameters?: unknown }[] };
}

export async function getWorkflow(workflowId: string): Promise<WorkflowDetail> {
  return api<WorkflowDetail>(`/workflows/${workflowId}`);
}

/**
 * The nodes that are actually RUNNING, which is not always the nodes you see
 * when you open the workflow. n8n keeps a draft separate from the published
 * version, and a published version can lag the draft indefinitely.
 */
export function publishedNodes(workflow: WorkflowDetail) {
  return workflow.activeVersion?.nodes ?? workflow.nodes;
}

/**
 * What the `Webhook` node on an Evolution-fed hub (e.g. `HUB Tere - 2462`)
 * actually received, or null if the shape doesn't match.
 */
export interface InboundHubEvent {
  status: string | null;
  content: string | null;
}

export function inboundHubEvent(execution: ExecutionDetail): InboundHubEvent | null {
  const runs = execution.data?.resultData?.runData?.Webhook;
  if (!Array.isArray(runs) || runs.length === 0) return null;
  const last = runs[runs.length - 1] as {
    data?: { main?: { json?: unknown }[][] };
  };
  const body = (
    last?.data?.main?.[0]?.[0]?.json as
      | { body?: { data?: { status?: string; message?: { conversation?: string } } } }
      | undefined
  )?.body;
  if (!body) return null;
  return {
    status: body.data?.status ?? null,
    content: body.data?.message?.conversation ?? null,
  };
}

// ---------------------------------------------------------------------------
// Webhooks (no auth on either of these)
// ---------------------------------------------------------------------------

async function postWebhook(path: string, body: unknown): Promise<Response> {
  return fetch(`${env.n8nWebhookUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Sends a WhatsApp message AS the lead, to the account's SDR number. */
export async function sendAsLead(text: string): Promise<void> {
  const response = await postWebhook(env.webhooks.testSender, { mensagem: text });
  if (!response.ok) {
    throw new Error(`test sender webhook -> HTTP ${response.status}`);
  }
}

/**
 * Reads the Evolution error behind a failed send.
 *
 * `PRS - 30_Send_Message` calls the send sub-workflow, then branches on
 * `status == "200"`. Anything else lands on the CLOSED_LOST path, and the
 * execution still reports `success` — so the only place the real reason exists
 * is the sub-workflow node's output. Surfacing it turns "the lead went to
 * Perdido and the test timed out" into an actual diagnosis.
 */
export async function findSendFailureReason(since: Date): Promise<string | null> {
  const runs = await listExecutions(env.workflows.sendQueue, { since, limit: 20 });
  for (const run of runs) {
    const detail = await getExecution(run.id);
    const runData = detail.data?.resultData?.runData ?? {};
    for (const [nodeName, nodeRuns] of Object.entries(runData)) {
      if (!/^99_Send_Message_Function/.test(nodeName)) continue;
      const last = (nodeRuns as Record<string, unknown>[])[
        (nodeRuns as unknown[]).length - 1
      ] as { data?: { main?: { json?: { status?: string; response?: string } }[][] } };
      const json = last?.data?.main?.[0]?.[0]?.json;
      if (json && json.status && json.status !== "200") {
        return `execution ${run.id}, node "${nodeName}": status ${json.status} — ${json.response}`;
      }
    }
  }
  return null;
}

// NOTE: `PRS - 30_Send_Message` also exposes a webhook, and it is a dead end —
// its `Webhook` node has no outgoing connection at all (`main: [[]]`). Posting
// to it returns 200 and records an execution that runs one node and stops, so
// an earlier version of this harness logged "send queue forced" while nothing
// had been forced. The only real trigger is the 15-minute schedule.
void postWebhook;
