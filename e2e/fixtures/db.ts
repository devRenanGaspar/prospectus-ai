import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

/**
 * Production Supabase, as `service_role`. RLS does not apply to anything this
 * client does, which is the whole reason the write helpers below refuse to
 * take a target as a parameter.
 */
export const db: SupabaseClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export interface LeadRow {
  id: string;
  name: string | null;
  phone: string | null;
  status: string | null;
  country: string | null;
  category_name: string | null;
  lead_replied: string | null;
  lead_reply_score: string | null;
  ai_agent_enabled: boolean | null;
  mensagem_abordagem_comercial: string | null;
  search_id: string | null;
  user_id: string | null;
  updated_at: string | null;
}

const LEAD_COLUMNS =
  "id,name,phone,status,country,category_name,lead_replied,lead_reply_score," +
  "ai_agent_enabled,mensagem_abordagem_comercial,search_id,user_id,updated_at";

function unwrap<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what} failed: ${result.error.message}`);
  if (result.data === null) throw new Error(`${what} returned no data`);
  return result.data;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getLead(leadId: string): Promise<LeadRow> {
  const result = await db.from("leads").select(LEAD_COLUMNS).eq("id", leadId).single();
  return unwrap(result, `getLead(${leadId})`) as unknown as LeadRow;
}

export async function getLeadsBySearch(searchId: string): Promise<LeadRow[]> {
  const result = await db.from("leads").select(LEAD_COLUMNS).eq("search_id", searchId);
  return unwrap(result, `getLeadsBySearch(${searchId})`) as unknown as LeadRow[];
}

/**
 * How many leads carry the test phone, across the WHOLE table.
 *
 * This is not bookkeeping. Both `Find Lead` nodes in n8n — the SDR agent's and
 * the reply scorer's — require `count == 1`. A second lead with this phone
 * makes the agent and the scorer silently stop working, with every execution
 * still reporting success.
 */
export async function countLeadsWithPhone(phone: string): Promise<number> {
  const result = await db
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("phone", phone);
  if (result.error) throw new Error(`countLeadsWithPhone failed: ${result.error.message}`);
  return result.count ?? 0;
}

export interface MessageRow {
  id: string;
  lead_id: string;
  sender: string | null;
  content: string | null;
  timestamp: string | null;
}

export async function getMessages(leadId: string): Promise<MessageRow[]> {
  const result = await db
    .from("messages")
    .select("id,lead_id,sender,content,timestamp")
    .eq("lead_id", leadId)
    .order("timestamp", { ascending: true });
  return unwrap(result, `getMessages(${leadId})`) as unknown as MessageRow[];
}

/** Agent messages newer than `since`. The reply-detection primitive. */
export async function getAgentMessagesSince(leadId: string, since: Date): Promise<MessageRow[]> {
  const result = await db
    .from("messages")
    .select("id,lead_id,sender,content,timestamp")
    .eq("lead_id", leadId)
    .eq("sender", "AI")
    .gt("timestamp", since.toISOString())
    .order("timestamp", { ascending: true });
  return unwrap(result, "getAgentMessagesSince") as unknown as MessageRow[];
}

export async function getCreditsBalance(userId: string): Promise<number> {
  const result = await db.from("profiles").select("credits_balance").eq("id", userId).single();
  const row = unwrap(result, "getCreditsBalance") as { credits_balance: number | null };
  return row.credits_balance ?? 0;
}

export async function getFaq(userId: string): Promise<{ pergunta: string; resposta: string }[]> {
  const result = await db.from("profiles").select("context_faq").eq("id", userId).single();
  const row = unwrap(result, "getFaq") as { context_faq: unknown };
  return Array.isArray(row.context_faq)
    ? (row.context_faq as { pergunta: string; resposta: string }[])
    : [];
}

export async function getLatestSearch(
  userId: string,
  since: Date,
): Promise<{ id: string; status: string | null; leads_found: number | null; refunded_at: string | null } | null> {
  const result = await db
    .from("lead_searches")
    .select("id,status,leads_found,refunded_at")
    .eq("user_id", userId)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(1);
  const rows = unwrap(result, "getLatestSearch") as {
    id: string;
    status: string | null;
    leads_found: number | null;
    refunded_at: string | null;
  }[];
  return rows[0] ?? null;
}

/**
 * The niche the account has saved, and the `category_name` a lead of that niche
 * will carry.
 *
 * These are two different strings and confusing them is the trap here: the UI
 * shows "Advogado/Escritório de Advocacia" while the lead row says "lawyer".
 * `niche_options.lead_category` is the only bridge between them, so the
 * assertion reads it rather than hardcoding a mapping that would rot.
 */
export async function getExpectedSearchCategory(
  userId: string,
): Promise<{ nicheLabel: string; leadCategory: string }> {
  const profile = await db.from("profiles").select("context_icp").eq("id", userId).single();
  const icp = unwrap(profile, "getExpectedSearchCategory/profile") as {
    context_icp: { nichoPrincipal?: string } | null;
  };
  const nicheLabel = icp.context_icp?.nichoPrincipal?.trim();
  if (!nicheLabel) {
    throw new Error(
      "The account has no nichoPrincipal in context_icp. Set it once in the app; " +
        "the suite reads it rather than choosing one, to avoid writing to the profile.",
    );
  }

  const option = await db
    .from("niche_options")
    .select("name,lead_category")
    .eq("name", nicheLabel)
    .maybeSingle();
  if (option.error) throw new Error(`niche_options lookup failed: ${option.error.message}`);
  const row = option.data as { name: string; lead_category: string | null } | null;
  if (!row?.lead_category) {
    throw new Error(
      `Saved niche "${nicheLabel}" has no lead_category in niche_options, so there is ` +
        `nothing to assert the returned leads against.`,
    );
  }
  return { nicheLabel, leadCategory: row.lead_category };
}

export async function countLeadsInStatus(userId: string, status: string): Promise<number> {
  const result = await db
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", status);
  if (result.error) throw new Error(`countLeadsInStatus failed: ${result.error.message}`);
  return result.count ?? 0;
}

// ---------------------------------------------------------------------------
// Writes — scoped by construction, not by convention
// ---------------------------------------------------------------------------

/**
 * The authorisation the owner granted is narrow: the fixed test lead's rows and
 * nothing else. These helpers take no target parameter, so there is no call
 * site that could point them somewhere else — and every one of them re-checks
 * the target's identity before writing.
 *
 * `assertTestLead` is that check. It fails closed: any mismatch throws before a
 * single row is touched.
 */
export async function assertTestLead(): Promise<LeadRow> {
  const lead = await getLead(env.leadId);
  if (lead.id !== env.leadId) {
    throw new Error(`Refusing to write: expected lead ${env.leadId}, got ${lead.id}`);
  }
  if (lead.phone !== env.leadPhone) {
    throw new Error(
      `Refusing to write: lead ${env.leadId} has phone ${lead.phone}, expected ${env.leadPhone}. ` +
        `The suite only ever operates on the designated test lead.`,
    );
  }
  if (lead.user_id !== env.userId) {
    throw new Error(
      `Refusing to write: lead ${env.leadId} belongs to ${lead.user_id}, expected ${env.userId}.`,
    );
  }
  return lead;
}

export async function updateTestLead(patch: Partial<LeadRow>): Promise<void> {
  await assertTestLead();
  const result = await db.from("leads").update(patch).eq("id", env.leadId);
  if (result.error) throw new Error(`updateTestLead failed: ${result.error.message}`);
}

/** Deletes every message of the test lead except the oldest one. */
export async function deleteTestLeadMessagesExceptFirst(): Promise<number> {
  await assertTestLead();
  const messages = await getMessages(env.leadId);
  if (messages.length <= 1) return 0;

  const [oldest, ...rest] = messages;
  const doomed = rest.map((m) => m.id);
  const result = await db
    .from("messages")
    .delete()
    .eq("lead_id", env.leadId) // scope clause, always present
    .neq("id", oldest.id)
    .in("id", doomed);
  if (result.error) throw new Error(`deleteTestLeadMessages failed: ${result.error.message}`);
  return doomed.length;
}

/** Clears the agent's Postgres-backed conversation memory for this lead. */
export async function clearAgentMemory(): Promise<void> {
  await assertTestLead();
  const result = await db
    .from(env.agentMemoryTable)
    .delete()
    .eq("session_id", env.leadPhone); // scope clause, always present
  if (result.error) throw new Error(`clearAgentMemory failed: ${result.error.message}`);
}

/**
 * Re-enables the agent at the tenant level.
 *
 * This is not one-off repair: `SETUP` turns the agent off for a lead whenever
 * the operator replies from their own WhatsApp, so it has to be re-asserted
 * before every run.
 */
export async function setTenantAgentOn(): Promise<void> {
  await assertTestLead();
  const result = await db
    .from(env.crmTable)
    .update({ agent_on_off: "ON" })
    .eq("phone", env.leadPhone); // scope clause, always present
  if (result.error) throw new Error(`setTenantAgentOn failed: ${result.error.message}`);
}

export async function getTenantAgentState(): Promise<string | null> {
  const result = await db
    .from(env.crmTable)
    .select("agent_on_off")
    .eq("phone", env.leadPhone)
    .maybeSingle();
  if (result.error) throw new Error(`getTenantAgentState failed: ${result.error.message}`);
  return (result.data as { agent_on_off: string | null } | null)?.agent_on_off ?? null;
}
