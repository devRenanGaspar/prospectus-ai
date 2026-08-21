import { z } from "zod";

/**
 * Zod mirror of a subset of `n8n-proxy`'s request contract
 * (supabase/functions/n8n-proxy/index.ts), the edge function n8n calls to
 * write into this database.
 *
 * This is NOT imported by n8n-proxy itself, and is not deployed — n8n-proxy
 * is a Deno function, this runs on the Node/Vite toolchain. It exists so the
 * request shapes n8n-proxy actually accepts have a single, typed,
 * test-checked definition instead of only living as inline `if (!x) return
 * 400` checks scattered across a 1000+ line switch statement.
 *
 * Deliberately partial: n8n-proxy has ~25 actions, this covers the 9 that
 * write or read the most consequential data (leads, messages, credits,
 * request status). `index.ts` remains the source of truth for every action,
 * including the ones not modeled here — see docs/eval-report.md and
 * evals/README.md for the same "seed, not exhaustive" framing applied to the
 * copy-grounding checks.
 *
 * `src/lib/n8n-events.ts` documents the other half of this boundary: the
 * app-to-n8n event contract, going the opposite direction through
 * `webhook-proxy`.
 */

const uuid = z.string().uuid();

// index.ts sanitizes empty strings to null for these before insert — model
// nullability as it actually behaves, not as "always present."
const nullableString = z.string().nullable().optional();

export const leadInputSchema = z
  .object({
    google_place_id: nullableString,
    user_id: uuid.nullable().optional(),
    search_id: uuid.nullable().optional(),
    name: z.string().optional(),
    phone: nullableString,
    company_name: z.string().optional(),
    city: nullableString,
    state: z.string().optional(),
    country: z.string().optional(),
    category_name: z.string().optional(),
    website: nullableString,
    instagram: nullableString,
    reviews_count: z.union([z.string(), z.number()]).optional(),
    total_score: z.union([z.string(), z.number()]).optional(),
  })
  // Real lead payloads carry more columns than are worth typing individually
  // here (see the ALLOWED/NULLABLE field lists in index.ts) — this checks the
  // fields most worth catching a regression on, not the full row shape.
  .passthrough();

export const insertLeadsRequestSchema = z.object({
  action: z.literal("insert_leads"),
  leads: z.array(leadInputSchema).min(1),
  search_id: uuid.optional(),
});

export const LEAD_STATUS_VALUES = [
  "NEW",
  "COPY_PENDING",
  "COPY_READY",
  "SEND_PENDING",
  "SENT",
  "IN_CONVERSATION",
  "FOLLOW_UP",
  "SCHEDULED",
  "CLOSED_WON",
  "CLOSED_LOST",
] as const;

export const updateLeadStatusRequestSchema = z.object({
  action: z.literal("update_lead_status"),
  lead_id: uuid,
  status: z.enum(LEAD_STATUS_VALUES),
});

// messages.sender CHECK constraint (20260305231141): 'AI' | 'USER' | 'LEAD' | 'SYSTEM'.
export const MESSAGE_SENDER_VALUES = ["AI", "USER", "LEAD", "SYSTEM"] as const;

export const insertMessageRequestSchema = z.object({
  action: z.literal("insert_message"),
  lead_id: uuid,
  content: z.string().min(1),
  sender: z.enum(MESSAGE_SENDER_VALUES),
  external_message_id: z.string().optional(),
});

export const getLeadByPhoneRequestSchema = z.object({
  action: z.literal("get_lead_by_phone"),
  phone: z.string().min(1),
});

// Mirrors index.ts's ALLOWED_COLUMNS allow-list for query_leads filters.
const QUERY_LEADS_FILTER_COLUMNS = [
  "id",
  "search_id",
  "user_id",
  "phone",
  "google_place_id",
  "status",
  "cnpj",
  "instagram",
  "city",
  "category_name",
  "name",
  "lead_replied",
] as const;

export const queryLeadsRequestSchema = z.object({
  action: z.literal("query_leads"),
  filters: z
    .record(z.enum(QUERY_LEADS_FILTER_COLUMNS), z.union([z.string(), z.null()]))
    .refine((f) => Object.keys(f).length > 0, "filters object required (non-empty)"),
  limit: z.number().int().positive().max(200).optional(),
  has_website: z.boolean().nullable().optional(),
});

const REQUEST_STATUS_VALUES = ["processing", "completed", "failed"] as const;

export const updateCopyRequestStatusRequestSchema = z.object({
  action: z.literal("update_copy_request_status"),
  copy_request_id: uuid,
  status: z.enum(REQUEST_STATUS_VALUES),
});

export const updateSendRequestStatusRequestSchema = z.object({
  action: z.literal("update_send_request_status"),
  send_request_id: uuid,
  status: z.enum(REQUEST_STATUS_VALUES),
});

export const deductCreditsRequestSchema = z.object({
  action: z.literal("deduct_credits"),
  user_id: uuid,
  action_name: z.string().min(1),
  lead_id: uuid.nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  phone: z.string().nullable().optional(),
});

export const deductCreditsBulkRequestSchema = z.object({
  action: z.literal("deduct_credits_bulk"),
  user_id: uuid,
  action_name: z.string().min(1),
  quantity: z.number().int().positive(),
  lead_id: uuid.nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  phone: z.string().nullable().optional(),
});

/**
 * Discriminated union of the 9 modeled actions. Parsing a payload whose
 * `action` isn't one of these 9 will fail here even though index.ts may
 * handle it fine — check the action list above before treating a rejection
 * from this schema as a real bug.
 */
export const n8nProxyModeledRequestSchema = z.discriminatedUnion("action", [
  insertLeadsRequestSchema,
  updateLeadStatusRequestSchema,
  insertMessageRequestSchema,
  getLeadByPhoneRequestSchema,
  queryLeadsRequestSchema,
  updateCopyRequestStatusRequestSchema,
  updateSendRequestStatusRequestSchema,
  deductCreditsRequestSchema,
  deductCreditsBulkRequestSchema,
]);
