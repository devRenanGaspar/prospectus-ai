// Column allow-lists for the lead writes `n8n-proxy` performs on n8n's behalf.
//
// Why this exists: `n8n-proxy` holds the service-role key, so RLS does not
// filter anything it does. Both `insert_leads` and `update_lead` used to take
// the caller's object and spread it straight into the query. On the update path
// that meant a request carrying `user_id` or `assigned_user_id` could move a
// lead to a different tenant; on the insert path it meant any key at all
// reached Postgres.
//
// Two lists rather than one, because the two operations legitimately differ:
// creating a lead has to set its owner, changing a lead must never do so.
//
// Plain TypeScript with no Deno globals, so `src/test/` imports the same code
// the deployed function runs.

/** Every column of `public.leads`, from `src/integrations/supabase/types.ts`. */
export const LEAD_INSERT_COLUMNS: ReadonlySet<string> = new Set([
  "ai_agent_enabled", "ai_generated_copy", "assigned_user_id", "category_name",
  "city", "cnpj", "cnpj_alternativo", "company_name", "contact_info", "country",
  "created_at", "google_place_id", "id", "image_url", "images_count",
  "instagram", "instagram_alternativo", "last_message_at", "lead_replied",
  "lead_reply_score", "mensagem_abordagem_comercial", "name", "neighborhood",
  "phone", "rank", "reviews_count", "search_id", "source", "state", "status",
  "total_score", "updated_at", "user_id", "website", "website_analysis",
  "whatsapp_alternativo", "whatsapp_do_site",
]);

/**
 * Columns n8n may change on an existing lead.
 *
 * Excluded on purpose, and each for a reason:
 *   id, created_at         -- identity; rewriting them is never a lead update
 *   user_id, assigned_user_id, search_id
 *                          -- ownership. This is the cross-tenant hole: the
 *                             update runs as service_role, so nothing else
 *                             would have stopped it
 *   updated_at             -- set by the function itself, not by the caller
 *
 * Reassigning a lead is a real operation, but it belongs to a dedicated action
 * (`set_lead_owner`), not to a generic field update.
 */
export const LEAD_UPDATE_COLUMNS: ReadonlySet<string> = new Set(
  [...LEAD_INSERT_COLUMNS].filter(
    (c) => ![
      "id", "created_at", "updated_at",
      "user_id", "assigned_user_id", "search_id",
    ].includes(c),
  ),
);

export interface PickResult {
  /** The subset of the input whose keys are on the list. */
  allowed: Record<string, unknown>;
  /** Keys that were not, named so the caller can say which ones it refused. */
  rejected: string[];
}

function pick(
  input: Record<string, unknown>,
  allowList: ReadonlySet<string>,
): PickResult {
  const allowed: Record<string, unknown> = {};
  const rejected: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (allowList.has(key)) allowed[key] = value;
    else rejected.push(key);
  }
  return { allowed, rejected };
}

/** Splits an `update_lead` payload into what may be written and what may not. */
export function pickUpdatableLeadColumns(
  updates: Record<string, unknown>,
): PickResult {
  return pick(updates, LEAD_UPDATE_COLUMNS);
}

/** Splits an `insert_leads` row into what may be written and what may not. */
export function pickInsertableLeadColumns(
  lead: Record<string, unknown>,
): PickResult {
  return pick(lead, LEAD_INSERT_COLUMNS);
}
