import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  classifyRuntimeError,
  n8nCorrelation,
  N8N_ACTIONS,
  recordOperationalEvent,
  resultCount,
  safeAllowlistedValue,
} from "../_shared/operational-telemetry.ts";
import { bearerToken, timingSafeEqualStr } from "../_shared/auth.ts";
import { isAuthorizedForAction } from "../_shared/sensitive-actions.ts";
import {
  pickInsertableLeadColumns,
  pickUpdatableLeadColumns,
} from "../_shared/lead-columns.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

// Reuse client across requests within the same isolate
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(supabaseUrl, serviceRoleKey);

// Auto-detect which leads table a given id belongs to.
// Checks `leads` first (hot path), falls back to `leads_reserve`.
async function findLeadTable(leadId: string): Promise<"leads" | "leads_reserve" | null> {
  const { data: l } = await admin.from("leads").select("id").eq("id", leadId).maybeSingle();
  if (l) return "leads";
  const { data: r } = await admin.from("leads_reserve").select("id").eq("id", leadId).maybeSingle();
  if (r) return "leads_reserve";
  return null;
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Safety deadline, ahead of the gateway's 60s cut.
  //
  // This used to be `setTimeout(() => { throw new Error(...) }, 55000)`. That
  // throw ran in a macrotask, outside the promise this handler returns: the
  // `catch` below could never see it, nothing was cancelled, and in the best
  // case it surfaced as an unhandled rejection in the isolate. The
  // `clearTimeout` calls scattered through the file made it look like a
  // working mechanism. It was decoration.
  //
  // The honest version, copied from webhook-proxy/index.ts:236 rather than
  // designed fresh: an AbortController whose signal goes to every outbound
  // fetch, and a catch that turns the abort into a 504 the caller can act on.
  //
  // What it does not do, said plainly: AbortController cannot cancel a
  // supabase-js query already in flight. The gain is that the deadline
  // becomes catchable and the external call -- the realistic candidate for
  // hanging -- is actually cut off.
  const deadline = new AbortController();
  const timeoutId = setTimeout(() => deadline.abort(), 55000);
  const requestStartedAt = Date.now();
  let telemetryAction = "unknown";
  let telemetryCorrelation: { correlationId: string | null; requestId: string | null } = {
    correlationId: null,
    requestId: null,
  };

  try {
    // Authenticate via shared token. Constant-time: the previous `!==`
    // string comparison leaks timing information about how many leading
    // bytes matched. Two tokens are accepted -- see SENSITIVE_ACTIONS above
    // for why -- and which one matched is checked again once `action` is
    // known.
    const providedToken = bearerToken(req);
    const expectedToken = Deno.env.get("N8N_SHARED_TOKEN") ?? "";
    const adminToken = Deno.env.get("N8N_ADMIN_SHARED_TOKEN") ?? "";
    // A third credential, for one action: the calendar token exchange. See
    // _shared/sensitive-actions.ts for why it is its own tier rather than
    // joining either existing one.
    const calendarToken = Deno.env.get("N8N_CALENDAR_TOKEN") ?? "";

    const matchesOperational = expectedToken.length > 0 && timingSafeEqualStr(providedToken, expectedToken);
    const matchesAdmin = adminToken.length > 0 && timingSafeEqualStr(providedToken, adminToken);
    const matchesCalendar = calendarToken.length > 0 && timingSafeEqualStr(providedToken, calendarToken);

    if (!matchesOperational && !matchesAdmin && !matchesCalendar) {
      clearTimeout(timeoutId);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action } = body;
    telemetryAction = safeAllowlistedValue(action, N8N_ACTIONS);
    telemetryCorrelation = n8nCorrelation(body);

    // Money, subscription and account-access actions require the admin
    // credential; the calendar token exchange requires its own, and accepts
    // neither the operational token nor the admin one. Both tiers exist so
    // that a leak of the operational token -- which is spread across ~30 n8n
    // workflows and pasted into Set nodes -- does not also grant the ability
    // to hand out credits, open accounts, or read a customer's calendar.
    if (!isAuthorizedForAction(action, { matchesAdmin, matchesOperational, matchesCalendar })) {
      console.warn(`[n8n-proxy] sensitive_action_denied action=${telemetryAction}`);
      clearTimeout(timeoutId);
      return new Response(
        JSON.stringify({ error: "Forbidden: this action requires a different token" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!action) {
      await recordOperationalEvent(admin, {
        eventName: "n8n.action_failed",
        source: "n8n",
        status: "failed",
        durationMs: Date.now() - requestStartedAt,
        errorCode: "INVALID_ACTION",
        attributes: { action: "unknown", provider: "n8n" },
      });
      return new Response(JSON.stringify({ error: "Missing action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let result: unknown;

    switch (action) {
      // ── INSERT LEADS (batch) ──
      case "insert_leads": {
        const { leads, search_id } = body;
        if (!Array.isArray(leads) || leads.length === 0) {
          return new Response(JSON.stringify({ error: "leads array required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        // Attach search_id to each lead if provided
        const leadsWithSearch = search_id
          ? leads.map((l: Record<string, unknown>) => ({ ...l, search_id }))
          : leads;

        // Sanitize empty strings: UUID fields → null, other nullable text fields → null
        const UUID_FIELDS = ["search_id", "user_id", "assigned_user_id", "lead_id"];
        const NULLABLE_TEXT_FIELDS = [
          "cnpj", "instagram", "lead_replied", "lead_reply_score",
          "mensagem_abordagem_comercial", "ai_generated_copy", "cnpj_alternativo",
          "instagram_alternativo", "whatsapp_do_site", "whatsapp_alternativo",
          "google_place_id", "neighborhood", "city", "website", "image_url",
          "category_name", "source", "company_name", "phone",
          "total_score", "reviews_count", "rank", "images_count",
          "state", "country", "website_analysis",
        ];
        // Same allow-list treatment as `update_lead` -- this is the other place
        // a caller-supplied object reached a query unfiltered. Unknown keys
        // used to surface as a Postgres error from deep inside the insert;
        // naming them in a 400 says which key and which row.
        const rejectedKeys = new Set<string>();
        const sanitized = leadsWithSearch.map((lead: Record<string, unknown>) => {
          const { allowed, rejected } = pickInsertableLeadColumns(lead);
          rejected.forEach((k) => rejectedKeys.add(k));
          for (const key of Object.keys(allowed)) {
            if (allowed[key] === "") {
              if (UUID_FIELDS.includes(key) || NULLABLE_TEXT_FIELDS.includes(key)) {
                allowed[key] = null;
              }
            }
          }
          return allowed;
        });
        if (rejectedKeys.size > 0) {
          return new Response(
            JSON.stringify({
              error: "leads contain columns that are not part of public.leads",
              rejected: [...rejectedKeys],
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        // Split: leads without google_place_id go straight to `leads`;
        // leads with gpid are checked for duplicates by (google_place_id, user_id).
        const candidates: Record<string, unknown>[] = [];
        const noGpid: Record<string, unknown>[] = [];
        for (const lead of sanitized) {
          if (lead.google_place_id) candidates.push(lead);
          else noGpid.push(lead);
        }

        let existingKeys = new Set<string>();
        if (candidates.length > 0) {
          const gpids = [...new Set(candidates.map((c) => c.google_place_id as string))];
          const { data: existing, error: existErr } = await admin
            .from("leads")
            .select("google_place_id, user_id")
            .in("google_place_id", gpids);
          if (existErr) throw existErr;
          existingKeys = new Set(
            (existing ?? []).map((r: { google_place_id: string | null; user_id: string | null }) =>
              `${r.google_place_id}|${r.user_id ?? "NULL"}`
            )
          );
        }

        const toReserve: Record<string, unknown>[] = [];
        const toInsert: Record<string, unknown>[] = [...noGpid];
        for (const lead of candidates) {
          const key = `${lead.google_place_id}|${lead.user_id ?? "NULL"}`;
          if (existingKeys.has(key)) toReserve.push(lead);
          else toInsert.push(lead);
        }

        let insertedLeads: unknown[] = [];
        if (toInsert.length > 0) {
          const { data, error } = await admin.from("leads").insert(toInsert).select();
          if (error) throw error;
          insertedLeads = data ?? [];
        }

        let reservedLeads: unknown[] = [];
        if (toReserve.length > 0) {
          const { data, error } = await admin.from("leads_reserve").insert(toReserve).select();
          if (error) throw error;
          reservedLeads = data ?? [];
        }

        // Update leads_found counter on the search record (reserved don't count)
        if (search_id) {
          await admin
            .from("lead_searches")
            .update({ leads_found: insertedLeads.length, status: "completed" })
            .eq("id", search_id);
        }

        result = {
          inserted: insertedLeads.length,
          reserved: reservedLeads.length,
          leads: insertedLeads,
          reserved_leads: reservedLeads,
        };
        break;
      }

      // ── PROMOTE RESERVE TO POOL ──
      case "promote_reserve_to_pool": {
        const { data, error } = await admin.rpc("promote_reserve_to_pool");
        if (error) throw error;
        result = { success: true, data };
        break;
      }

      // ── UPDATE LEAD ──
      case "update_lead": {
        const { lead_id, updates } = body;
        if (!lead_id || !updates) {
          return new Response(JSON.stringify({ error: "lead_id and updates required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const table = await findLeadTable(lead_id);
        if (!table) {
          return new Response(JSON.stringify({ error: "lead not found" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        // Ownership columns are not updatable here -- this runs as
        // service_role, so RLS would not have stopped a payload that moved the
        // lead to another tenant. Rejected keys are named in the 400 rather
        // than dropped: silently ignoring them lets n8n believe it wrote.
        const { allowed, rejected } = pickUpdatableLeadColumns(
          updates as Record<string, unknown>,
        );
        if (rejected.length > 0) {
          return new Response(
            JSON.stringify({
              error: "updates contains columns that cannot be set here",
              rejected,
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        if (Object.keys(allowed).length === 0) {
          return new Response(JSON.stringify({ error: "updates is empty" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { data, error } = await admin
          .from(table)
          .update({ ...allowed, updated_at: new Date().toISOString() })
          .eq("id", lead_id)
          .select()
          .single();
        if (error) throw error;
        result = { lead: data, table };
        break;
      }

      // ── UPDATE LEAD STATUS ──
      case "update_lead_status": {
        const { lead_id: lid, status } = body;
        if (!lid || !status) {
          return new Response(JSON.stringify({ error: "lead_id and status required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { data, error } = await admin
          .from("leads")
          .update({ status, updated_at: new Date().toISOString() })
          .eq("id", lid)
          .select()
          .single();
        if (error) throw error;
        result = { lead: data };
        break;
      }

      // ── INSERT MESSAGE ──
      case "insert_message": {
        const { lead_id: mlid, content, sender, external_message_id } = body;
        if (!mlid || !content || !sender) {
          return new Response(JSON.stringify({ error: "lead_id, content, sender required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { data, error } = await admin
          .from("messages")
          .insert({ lead_id: mlid, content, sender, external_message_id })
          .select()
          .single();
        if (error) throw error;

        // Update lead's last_message_at
        await admin
          .from("leads")
          .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", mlid);

        result = { message: data };
        break;
      }

      // ── GET LEAD BY PHONE ──
      case "get_lead_by_phone": {
        const { phone } = body;
        if (!phone) {
          return new Response(JSON.stringify({ error: "phone required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { data, error } = await admin
          .from("leads")
          .select("*")
          .eq("phone", phone);
        if (error) throw error;
        result = { leads: data };
        break;
      }

      // ── GET LEAD BY GOOGLE PLACE ID ──
      case "get_lead_by_google_place_id": {
        const { google_place_id } = body;
        if (!google_place_id) {
          return new Response(JSON.stringify({ error: "google_place_id required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { data, error } = await admin
          .from("leads")
          .select("*")
          .eq("google_place_id", google_place_id);
        if (error) throw error;
        result = { leads: data };
        break;
      }

      // ── QUERY LEADS (generic) ──
      case "query_leads": {
        const { filters, limit: rawLimit, has_website } = body;
        if (!filters || typeof filters !== "object" || Object.keys(filters).length === 0) {
          return new Response(JSON.stringify({ error: "filters object required (non-empty)" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const ALLOWED_COLUMNS = [
          "id", "search_id", "user_id", "phone", "google_place_id",
          "status", "cnpj", "instagram", "city", "category_name", "name",
          "lead_replied",
        ];

        const invalidCols = Object.keys(filters).filter((k) => !ALLOWED_COLUMNS.includes(k));
        if (invalidCols.length > 0) {
          return new Response(
            JSON.stringify({ error: `Invalid filter columns: ${invalidCols.join(", ")}` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Validate has_website: must be true, false, null, or undefined
        if (has_website !== undefined && has_website !== null && typeof has_website !== "boolean") {
          return new Response(
            JSON.stringify({ error: "has_website must be a boolean, null, or omitted" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const safeLimit = Math.min(Math.max(1, Number(rawLimit) || 50), 200);
        let query = admin.from("leads").select("*");
        for (const [col, val] of Object.entries(filters)) {
          if (val === null || val === "") {
            query = query.is(col, null);
          } else {
            query = query.eq(col, val);
          }
        }

        // has_website === true → only leads with website filled
        // false / null / undefined → no filter (returns with and without)
        if (has_website === true) {
          query = query.not("website", "is", null).neq("website", "");
        }

        // Deterministic order. The SDR agent resolves an inbound WhatsApp
        // number to a lead with limit 1, and 63 phone numbers in production
        // are duplicated within the same tenant. Without an explicit order
        // Postgres may return a different row between calls, so the same
        // caller could attach to a different lead record run to run. Ordering
        // by created_at (id as tiebreaker) makes the winner stable: the
        // oldest record for that phone always wins.
        const { data, error } = await query
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .limit(safeLimit);
        if (error) throw error;
        result = { leads: data, count: data.length };
        break;
      }

      // ── SET LEAD OWNER (bulk) ──
      case "set_lead_owner": {
        const { user_id: ownerUid, search_id: ownerSid, lead_id_list } = body;
        if (!Array.isArray(lead_id_list) || lead_id_list.length === 0) {
          return new Response(JSON.stringify({ error: "lead_id_list (non-empty array) required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const cleanOwnerUid = ownerUid === "" ? null : ownerUid || null;
        const cleanOwnerSid = ownerSid === "" ? null : ownerSid || null;
        if (!cleanOwnerUid && !cleanOwnerSid) {
          return new Response(JSON.stringify({ error: "At least one of user_id or search_id must be provided" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const ownerUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (cleanOwnerUid !== undefined) ownerUpdate.user_id = cleanOwnerUid;
        if (cleanOwnerSid !== undefined) ownerUpdate.search_id = cleanOwnerSid;
        const { data: ownerData, error: ownerError } = await admin
          .from("leads")
          .update(ownerUpdate)
          .in("id", lead_id_list)
          .select("id");
        if (ownerError) throw ownerError;
        result = { success: true, updated: ownerData?.length ?? 0 };
        break;
      }

      // ── UPDATE SEARCH STATUS ──
      case "update_search_status": {
        const { search_id: sid, status: searchStatus, leads_found: lf } = body;
        if (!sid) {
          return new Response(JSON.stringify({ error: "search_id required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const updateFields: Record<string, unknown> = {};
        if (searchStatus) updateFields.status = searchStatus;
        if (lf !== undefined) updateFields.leads_found = lf;

        const { error } = await admin.from("lead_searches").update(updateFields).eq("id", sid);
        if (error) throw error;
        result = { success: true };
        break;
      }

      // ── UPDATE WHATSAPP STATUS ──
      case "update_whatsapp": {
        const { user_id, whatsapp_status, whatsapp_number, whatsapp_photo, n8n_workflow_id } = body;
        if (!user_id) {
          return new Response(JSON.stringify({ error: "user_id required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const updateData: Record<string, unknown> = {};
        if (whatsapp_status !== undefined) updateData.whatsapp_status = whatsapp_status;
        if (whatsapp_number !== undefined) updateData.whatsapp_number = whatsapp_number;
        if (whatsapp_photo !== undefined) updateData.whatsapp_photo = whatsapp_photo;
        if (n8n_workflow_id !== undefined) updateData.n8n_workflow_id = n8n_workflow_id;

        const { error } = await admin.from("profiles").update(updateData).eq("id", user_id);
        if (error) throw error;
        result = { success: true };
        break;
      }

      // ── UPDATE COPY REQUEST STATUS ──
      case "update_copy_request_status": {
        const { copy_request_id, status: crStatus } = body;
        if (!copy_request_id || !crStatus) {
          return new Response(JSON.stringify({ error: "copy_request_id and status required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const validStatuses = ["processing", "completed", "failed"];
        if (!validStatuses.includes(crStatus)) {
          return new Response(JSON.stringify({ error: `Invalid status. Must be: ${validStatuses.join(", ")}` }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        // Locks the row and refuses to mark it completed/failed if
        // fail_copy_request already claimed it as refunded -- same
        // transactional barrier close_fail_search_clawback_race.sql applies
        // to searches, so a client-side "webhook failed" refund and this
        // callback can't both win.
        const { data: ccData, error: ccError } = await admin.rpc("complete_copy_request", {
          _request_id: copy_request_id,
          _status: crStatus,
        });
        if (ccError) throw ccError;
        if (!ccData?.success) {
          return new Response(JSON.stringify({ error: ccData?.error ?? "UPDATE_FAILED", status: ccData?.status }), {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        result = { success: true };
        break;
      }

      // ── UPDATE SEND REQUEST STATUS ──
      case "update_send_request_status": {
        const { send_request_id, status: srStatus } = body;
        if (!send_request_id || !srStatus) {
          return new Response(JSON.stringify({ error: "send_request_id and status required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const validSendStatuses = ["processing", "completed", "failed"];
        if (!validSendStatuses.includes(srStatus)) {
          return new Response(JSON.stringify({ error: `Invalid status. Must be: ${validSendStatuses.join(", ")}` }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { error } = await admin
          .from("send_requests")
          .update({ status: srStatus })
          .eq("id", send_request_id);
        if (error) throw error;
        result = { success: true };
        break;
      }

      // ── CALENDAR ACCESS TOKEN ──
      // Returns a ~1h Google access token instead of the refresh token: the
      // refresh token is read from user_google_tokens (service_role) and
      // exchanged right here, so it never crosses this function's response
      // boundary. The workflow that needs calendar access gets a token that
      // expires on its own and is scoped to the Calendar API alone -- it
      // never sees the credential that could mint another one.
      //
      // Gated on its own calendar-tier credential rather than
      // SENSITIVE_ACTIONS (see _shared/sensitive-actions.ts): the operational
      // token would spread the admin credential through every SDR agent
      // workflow just to book a meeting, trading one exposure for a worse
      // one.
      case "get_calendar_access_token": {
        const { user_id: calAccessUid } = body;
        if (!calAccessUid) {
          return new Response(JSON.stringify({ error: "user_id required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Both queries below check their own error rather than discarding
        // it, and a non-2xx from Google below is distinguished by cause: the
        // workflow reads a null access_token as "reconnect your calendar",
        // which is only true for "not connected" and "access revoked" --
        // not for a 429, a 500, or a misconfigured credential, none of which
        // are the customer's problem to fix.
        const { data: calAccessProfile, error: calProfileErr } = await admin
          .from("profiles")
          .select("google_calendar_email")
          .eq("id", calAccessUid)
          .maybeSingle();
        if (calProfileErr) throw calProfileErr;

        const { data: calAccessTok, error: calTokErr } = await admin
          .from("user_google_tokens")
          .select("refresh_token")
          .eq("user_id", calAccessUid)
          .maybeSingle();
        if (calTokErr) throw calTokErr;

        const calendarEmail = calAccessProfile?.google_calendar_email ?? null;

        // Conta sem agenda conectada nao e erro: e o caso que o workflow
        // trata avisando o dono por WhatsApp para conectar. Devolver null
        // preserva esse ramo em vez de transformar em falha. `reason` existe
        // para que o workflow possa distinguir isso de uma falha, em vez de
        // inferir a partir de um null que antes significava as duas coisas.
        if (!calAccessTok?.refresh_token) {
          result = {
            access_token: null,
            expires_in: null,
            email: calendarEmail,
            reason: "not_connected",
          };
          break;
        }

        const googleTokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: Deno.env.get("GOOGLE_CLIENT_ID") ?? "",
            client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "",
            refresh_token: calAccessTok.refresh_token,
            grant_type: "refresh_token",
          }),
          signal: deadline.signal,
        });

        if (!googleTokenRes.ok) {
          // Nunca logar o corpo inteiro: ele carrega o access token. O campo
          // `error` do OAuth do Google e um enum curto e nao carrega segredo.
          let googleError = "";
          try {
            googleError = String((await googleTokenRes.json())?.error ?? "");
          } catch {
            googleError = "";
          }
          console.warn(
            `[n8n-proxy] calendar_token_refresh_failed status=${googleTokenRes.status} error=${googleError || "unparsed"}`,
          );

          // `invalid_grant` e o unico nao-2xx que significa desconexao de
          // verdade: o usuario revogou o acesso no Google. Cai no mesmo ramo
          // do "conecte sua agenda", que e a mensagem correta.
          if (googleError === "invalid_grant") {
            result = {
              access_token: null,
              expires_in: null,
              email: calendarEmail,
              reason: "revoked",
            };
            break;
          }

          // Any other response -- 429, 500, a misconfigured credential -- is
          // our failure or Google's, not the customer's. It becomes a 500
          // with n8n.action_failed through the handler's own catch, and the
          // `Busca Access Token` node falls into its existing error branch
          // (onError: continueErrorOutput -> VerHor - Resp ERRO) instead of
          // receiving a misleading 200.
          //
          // 500 rather than 502: the handler has a single shared error
          // response, and what the workflow needs is the non-2xx itself, not
          // a distinction between "failed here" and "the upstream failed".
          throw new Error(
            `calendar_token_refresh_failed status=${googleTokenRes.status} error=${googleError || "unparsed"}`,
          );
        }

        const googleToken = await googleTokenRes.json();
        result = {
          access_token: googleToken.access_token ?? null,
          expires_in: googleToken.expires_in ?? null,
          email: calendarEmail,
        };
        break;
      }

      // ── UPDATE PROMPTS ──
      case "update_prompts": {
        const { user_id: puid, prompt_abordagem, prompt_sdr } = body;
        if (!puid) {
          return new Response(JSON.stringify({ error: "user_id required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const promptData: Record<string, unknown> = {};
        if (prompt_abordagem !== undefined) promptData.prompt_abordagem = prompt_abordagem;
        if (prompt_sdr !== undefined) promptData.prompt_sdr = prompt_sdr;

        if (Object.keys(promptData).length === 0) {
          return new Response(JSON.stringify({ error: "At least one prompt field required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { error } = await admin.from("profiles").update(promptData).eq("id", puid);
        if (error) throw error;
        result = { success: true };
        break;
      }

      // ── GET USER CONTEXT (by phone) ──
      case "get_user_context": {
        const { phone: ctxPhone } = body;
        if (!ctxPhone) {
          return new Response(JSON.stringify({ error: "phone required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { data: ctxData, error: ctxError } = await admin
          .from("profiles")
          .select("id, agency_name, business_type, owner_name, sdr_name, context_persona, context_icp, context_faq, sdr_phone, sdr_availability, google_calendar_email")
          .eq("whatsapp_number", ctxPhone)
          .limit(1)
          .maybeSingle();
        if (ctxError) throw ctxError;
        if (!ctxData) {
          return new Response(JSON.stringify({ error: "User not found" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        // This path never reads or returns the Google refresh token: the
        // workflow that needs calendar access calls
        // `get_calendar_access_token` instead, which performs the exchange
        // itself and returns a ~1h token. `email` stays, because the SDR
        // agent workflows read `google_calendar.email` to fill
        // `calendar_email`, and it isn't secret -- it already appears in the
        // Settings UI.
        result = {
          user_id: ctxData.id,
          google_calendar: {
            email: ctxData.google_calendar_email || null,
          },
          agency: {
            name: ctxData.agency_name,
            business_type: ctxData.business_type || "trafego_pago",
            owner_name: ctxData.owner_name || null,
            sdr_name: ctxData.sdr_name || "MarIA",
            persona: ctxData.context_persona || null,
            icp: ctxData.context_icp || {},
          },
          faq: ctxData.context_faq || [],
          sdr: {
            phone: ctxData.sdr_phone || null,
            availability: ctxData.sdr_availability || null,
          },
        };
        break;
      }

      // ── DEDUCT CREDITS (single) ──
      case "deduct_credits": {
        const { user_id: dcUid, action_name: dcAction, lead_id: dcLead, metadata: dcMeta, phone: dcPhone } = body;
        if (!dcUid || !dcAction) {
          return new Response(JSON.stringify({ error: "user_id and action_name required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { data: dcData, error: dcError } = await admin.rpc("deduct_credits", {
          _user_id: dcUid,
          _action_name: dcAction,
          _lead_id: dcLead || null,
          _metadata: dcMeta || {},
          _phone: dcPhone || null,
        });
        if (dcError) throw dcError;
        result = dcData;
        break;
      }

      // ── DEDUCT CREDITS BULK ──
      case "deduct_credits_bulk": {
        const { user_id: dbUid, action_name: dbAction, quantity: dbQty, lead_id: dbLead, metadata: dbMeta, phone: dbPhone } = body;
        if (!dbUid || !dbAction || !dbQty) {
          return new Response(JSON.stringify({ error: "user_id, action_name and quantity required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { data: dbData, error: dbError } = await admin.rpc("deduct_credits_bulk", {
          _user_id: dbUid,
          _action_name: dbAction,
          _quantity: dbQty,
          _lead_id: dbLead || null,
          _metadata: dbMeta || {},
          _phone: dbPhone || null,
        });
        if (dbError) throw dbError;
        result = dbData;
        break;
      }

      // ── INSERT LEAD COMMENTS (batch) ──
      case "insert_lead_comments": {
        const { lead_id: clid, comments: commentsList } = body;
        if (!clid) {
          return new Response(JSON.stringify({ error: "lead_id required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (!Array.isArray(commentsList) || commentsList.length === 0) {
          result = { inserted: 0, comments: [] };
          break;
        }
        const commentsTable = await findLeadTable(clid);
        if (!commentsTable) {
          return new Response(JSON.stringify({ error: "lead not found" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const rows = commentsList.map((c: { author_name: string; commented_at?: string; content: string; rating?: number }) => ({
          lead_id: clid,
          author_name: c.author_name,
          content: c.content,
          ...(c.commented_at ? { commented_at: c.commented_at } : {}),
          ...(c.rating ? { rating: c.rating } : {}),
        }));
        const { data: cData, error: cError } = await admin.from("lead_comments").insert(rows).select();
        if (cError) throw cError;
        result = { inserted: cData.length, comments: cData, table: commentsTable };
        break;
      }

      // ── GET LEAD COMMENTS ──
      case "get_lead_comments": {
        const { lead_id: glcId } = body;
        if (!glcId) {
          return new Response(JSON.stringify({ error: "lead_id required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { data: lcData, error: lcError } = await admin
          .from("lead_comments")
          .select("*")
          .eq("lead_id", glcId)
          .order("commented_at", { ascending: false });
        if (lcError) throw lcError;
        result = { comments: lcData ?? [] };
        break;
      }

      // ── GET QUEUE STATUS ──
      case "get_queue_status": {
        const { user_id: queueUid } = body;

        let searchQ = admin.from("lead_searches").select("id, user_id, status, created_at").eq("status", "pending");
        let copyQ = admin.from("copy_requests").select("id, user_id, status, created_at").eq("status", "processing");
        let sendQ = admin.from("send_requests").select("id, user_id, status, created_at").eq("status", "processing");

        if (queueUid) {
          searchQ = searchQ.eq("user_id", queueUid);
          copyQ = copyQ.eq("user_id", queueUid);
          sendQ = sendQ.eq("user_id", queueUid);
        }

        const [searches, copies, sends] = await Promise.all([searchQ, copyQ, sendQ]);
        if (searches.error) throw searches.error;
        if (copies.error) throw copies.error;
        if (sends.error) throw sends.error;

        result = {
          lead_searches: { count: searches.data.length, records: searches.data },
          copy_requests: { count: copies.data.length, records: copies.data },
          send_requests: { count: sends.data.length, records: sends.data },
        };
        break;
      }

      // ── GET USER CREDITS ──
      case "get_user_credits": {
        const { user_id: gcUid } = body;
        if (!gcUid) {
          return new Response(JSON.stringify({ error: "user_id required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { data: gcData, error: gcError } = await admin
          .from("profiles")
          .select("credits_balance, plan_id, role, whatsapp_status, plans(name)")
          .eq("id", gcUid)
          .single();
        if (gcError) throw gcError;
        result = {
          credits_balance: gcData.credits_balance,
          plan_id: gcData.plan_id,
          // `plans(name)` is a many-to-one embed (each profile has one plan),
          // but the untyped client has no schema to infer that from and
          // types every embed as an array.
          plan_name: (gcData.plans as unknown as { name: string } | null)?.name || null,
          role: gcData.role,
          whatsapp_status: gcData.whatsapp_status,
        };
        break;
      }

      // ── ADD CREDITS ──
      case "add_credits": {
        const { user_id: acUid, amount: acAmount } = body;
        if (!acUid || !acAmount || acAmount < 1) {
          return new Response(JSON.stringify({ error: "user_id and positive amount required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        // Atomic increment, no read-modify-write: two concurrent add_credits
        // calls for the same user used to race on a JS-side select-then-update
        // and could lose one of the two increments.
        const { data: acResult, error: acRpcErr } = await admin.rpc("admin_add_credits", {
          _user_id: acUid,
          _amount: acAmount,
        });
        if (acRpcErr) throw acRpcErr;
        result = acResult;
        break;
      }

      // ── RENEW SUBSCRIPTION ──
      case "renew_subscription": {
        const { user_id: rsUidInput, email: rsEmail, plan_id: rsPlan, period_days: rsDays } = body;
        if (!rsPlan) {
          return new Response(JSON.stringify({ error: "plan_id required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (!rsUidInput && !rsEmail) {
          return new Response(JSON.stringify({ error: "MISSING_USER_IDENTIFIER" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Resolve auth user: try user_id first, then fallback by email
        let resolvedUid: string | null = null;
        let resolvedVia: "user_id" | "email" = "user_id";

        if (rsUidInput) {
          try {
            const { data: gu, error: guErr } = await admin.auth.admin.getUserById(rsUidInput);
            if (!guErr && gu?.user?.id) {
              resolvedUid = gu.user.id;
              resolvedVia = "user_id";
            }
          } catch (_) {
            // ignore, will try email fallback
          }
        }

        if (!resolvedUid && rsEmail) {
          // Use Admin REST API directly: GET /auth/v1/admin/users?email=...
          const adminUrl = `${Deno.env.get("SUPABASE_URL")}/auth/v1/admin/users?email=${encodeURIComponent(rsEmail)}`;
          const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          const adminResp = await fetch(adminUrl, {
            headers: {
              Authorization: `Bearer ${serviceKey}`,
              apikey: serviceKey,
            },
            signal: deadline.signal,
          });
          if (adminResp.ok) {
            const adminJson = await adminResp.json();
            const found = Array.isArray(adminJson?.users) ? adminJson.users[0] : null;
            if (found?.id) {
              resolvedUid = found.id;
              resolvedVia = "email";
              if (rsUidInput && rsUidInput !== resolvedUid) {
                console.warn("[renew_subscription] identifier_fallback source=email");
              }
            }
          }
        }

        if (!resolvedUid) {
          return new Response(
            JSON.stringify({ error: "AUTH_USER_NOT_FOUND", user_id: rsUidInput ?? null, email: rsEmail ?? null }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        const rsUid = resolvedUid;
        const periodDays = rsDays || 30;
        const now = new Date();
        const periodEnd = new Date(now.getTime() + periodDays * 86400000);

        // Get plan credits
        const { data: rsPlanData, error: rsPlanErr } = await admin
          .from("plans")
          .select("credits_included")
          .eq("id", rsPlan)
          .single();
        if (rsPlanErr) throw rsPlanErr;

        const creditsRequested: number = rsPlanData.credits_included || 0;
        const capLimit = creditsRequested * 2;

        // Idempotency key: prefer client-supplied external_event_id, else derive deterministically
        const externalEventId: string | undefined = body.external_event_id;
        const todayIso = now.toISOString().slice(0, 10); // YYYY-MM-DD
        const idempotencyKey = externalEventId
          ? `ext:${externalEventId}`
          : `auto:${rsUid}:${rsPlan}:${todayIso}`;

        // Try to claim the idempotency slot
        const { data: claimedEvent, error: claimErr } = await admin
          .from("subscription_events")
          .insert({
            user_id: rsUid,
            plan_id: rsPlan,
            event_type: "renewal",
            status: "pending",
            credits_requested: creditsRequested,
            cap_limit: capLimit,
            period_start: now.toISOString(),
            period_end: periodEnd.toISOString(),
            idempotency_key: idempotencyKey,
            source: "n8n",
            raw_payload: body,
          })
          .select("id")
          .maybeSingle();

        if (claimErr) {
          // Unique violation → already processed
          if (claimErr.code === "23505") {
            const { data: prior } = await admin
              .from("subscription_events")
              .select("id, status, balance_after, credits_applied, credits_capped")
              .eq("idempotency_key", idempotencyKey)
              .maybeSingle();
            result = {
              success: true,
              idempotent: true,
              skipped: true,
              idempotency_key: idempotencyKey,
              prior_event: prior ?? null,
              resolved_user_id: rsUid,
              resolved_via: resolvedVia,
            };
            break;
          }
          throw claimErr;
        }

        const eventId = claimedEvent!.id;

        try {
          // Defensive: ensure profile row exists
          await admin
            .from("profiles")
            .upsert({ id: rsUid }, { onConflict: "id", ignoreDuplicates: true });

          // Check for existing active subscription.
          //
          // The `error` used to be dropped. A failed read is indistinguishable
          // from "no active subscription", and the branch below then INSERTS
          // -- leaving the account with two active subscription rows. Money
          // path: this one throws.
          const { data: existingSub, error: existingSubErr } = await admin
            .from("subscriptions")
            .select("id")
            .eq("user_id", rsUid)
            .eq("status", "active")
            .maybeSingle();
          if (existingSubErr) throw existingSubErr;

          let rsSubId: string;
          if (existingSub) {
            const { error: rsUpdErr } = await admin
              .from("subscriptions")
              .update({
                plan_id: rsPlan,
                current_period_start: now.toISOString(),
                current_period_end: periodEnd.toISOString(),
              })
              .eq("id", existingSub.id);
            if (rsUpdErr) throw rsUpdErr;
            rsSubId = existingSub.id;
          } else {
            const { data: rsNewSub, error: rsInsErr } = await admin
              .from("subscriptions")
              .insert({
                user_id: rsUid,
                plan_id: rsPlan,
                status: "active",
                provider: "n8n",
                current_period_start: now.toISOString(),
                current_period_end: periodEnd.toISOString(),
              })
              .select("id")
              .single();
            if (rsInsErr) throw rsInsErr;
            rsSubId = rsNewSub.id;
          }

          // Balance read, cap math and write happen atomically in the RPC --
          // this used to be a JS-side read-then-write with no row lock, so
          // two concurrent renewal events for the same user could both read
          // the same starting balance and the cap could be exceeded by up to
          // 2x. subscriptions/subscription_events stay here: the idempotency
          // slot above already serializes retries of the *same* event: what
          // was unprotected was different events racing on the balance.
          const { data: rsCreditsResult, error: rsRpcErr } = await admin.rpc(
            "admin_apply_subscription_credits",
            {
              _user_id: rsUid,
              _plan_id: rsPlan,
              _credits_requested: creditsRequested,
              _cap_limit: capLimit,
            },
          );
          if (rsRpcErr) throw rsRpcErr;

          const balanceBefore: number = rsCreditsResult.balance_before;
          const creditsApplied: number = rsCreditsResult.credits_applied;
          const creditsCapped: number = rsCreditsResult.credits_capped;
          const balanceAfter: number = rsCreditsResult.balance_after;

          // Finalize the event row. This is the idempotency ledger: if the
          // seal is lost, the row keeps saying the charge is in flight while
          // the credits are already on the account. Throwing here reaches the
          // catch below, which deletes the claim so a retry can apply it
          // exactly once -- the same outcome as any other failure inside this
          // block.
          const { error: sealEventErr } = await admin
            .from("subscription_events")
            .update({
              status: "applied",
              subscription_id: rsSubId,
              credits_applied: creditsApplied,
              credits_capped: creditsCapped,
              balance_before: balanceBefore,
              balance_after: balanceAfter,
            })
            .eq("id", eventId);
          if (sealEventErr) throw sealEventErr;

          result = {
            success: true,
            subscription_id: rsSubId,
            new_balance: balanceAfter,
            balance_before: balanceBefore,
            balance_after: balanceAfter,
            credits_applied: creditsApplied,
            credits_capped: creditsCapped,
            cap_limit: capLimit,
            period_end: periodEnd.toISOString(),
            resolved_user_id: rsUid,
            resolved_via: resolvedVia,
            idempotency_key: idempotencyKey,
          };
        } catch (innerErr) {
          // Roll back the pending event so a retry can succeed. If THIS fails
          // the idempotency key stays claimed forever and a legitimate charge
          // can never be applied -- so it is logged loudly rather than
          // discarded. It cannot change the response: the original failure is
          // what the caller needs to see, and it is rethrown below.
          const { error: rollbackErr } = await admin
            .from("subscription_events")
            .delete()
            .eq("id", eventId);
          if (rollbackErr) {
            console.error(
              `[n8n-proxy] subscription_event_rollback_failed event_id=${eventId} ` +
                `code=${classifyRuntimeError(rollbackErr)}`,
            );
          }
          throw innerErr;
        }
        break;
      }


      // ── SET USER ACCESS ──
      case "set_user_access": {
        const { user_id: saUid, blocked: saBlocked } = body;
        if (!saUid || saBlocked === undefined) {
          return new Response(JSON.stringify({ error: "user_id and blocked (boolean) required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const newRole = saBlocked ? "BLOCKED" : "USER";
        const { error: saErr } = await admin
          .from("profiles")
          .update({ role: newRole })
          .eq("id", saUid);
        if (saErr) throw saErr;
        result = { success: true, new_role: newRole };
        break;
      }

      case "pool_summary_by_category": {
        const { data, error } = await admin.rpc("get_pool_summary_by_category");
        if (error) throw error;
        result = { success: true, data };
        break;
      }


      default:
        await recordOperationalEvent(admin, {
          eventName: "n8n.action_failed",
          source: "n8n",
          correlationId: telemetryCorrelation.correlationId,
          requestId: telemetryCorrelation.requestId,
          status: "failed",
          durationMs: Date.now() - requestStartedAt,
          errorCode: "INVALID_ACTION",
          attributes: { action: telemetryAction, provider: "n8n" },
        });
        return new Response(JSON.stringify({ error: "Unknown action" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    const completedCount = resultCount(result);
    const operationType =
      telemetryAction === "update_search_status" || telemetryAction === "insert_leads"
        ? "find_leads"
        : telemetryAction === "update_copy_request_status"
          ? "generate_copy"
          : telemetryAction === "update_send_request_status"
            ? "send_message"
            : null;
    await recordOperationalEvent(admin, {
      eventName: "n8n.action_completed",
      source: "n8n",
      correlationId: telemetryCorrelation.correlationId,
      requestId: telemetryCorrelation.requestId,
      operationType,
      status: "completed",
      durationMs: Date.now() - requestStartedAt,
      attributes: {
        action: telemetryAction,
        provider: "n8n",
        ...(completedCount === null ? {} : { result_count: completedCount }),
      },
    });
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    // The deadline fired. Answer with a status that says so, instead of the
    // generic 500 that a caller cannot tell apart from a bug in the action.
    const timedOut = deadline.signal.aborted;
    const errorCode = timedOut ? "FUNCTION_TIMEOUT" : classifyRuntimeError(err);
    console.error(
      `[n8n-proxy] action_failed code=${errorCode} action=${telemetryAction} ` +
        `correlation_id=${telemetryCorrelation.correlationId ?? "none"} ` +
        `request_id=${telemetryCorrelation.requestId ?? "none"}`,
    );
    await recordOperationalEvent(admin, {
      eventName: "n8n.action_failed",
      source: "n8n",
      correlationId: telemetryCorrelation.correlationId,
      requestId: telemetryCorrelation.requestId,
      status: "failed",
      durationMs: Date.now() - requestStartedAt,
      errorCode,
      attributes: { action: telemetryAction, provider: "n8n" },
    });
    return new Response(
      JSON.stringify({
        error: timedOut ? "Function timeout: exceeded 55s safety limit" : "Internal server error",
        error_code: errorCode,
      }),
      {
        status: timedOut ? 504 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
