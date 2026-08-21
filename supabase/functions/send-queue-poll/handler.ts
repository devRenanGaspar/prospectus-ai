// Edge function: send-queue-poll
// Called by N8N every ~30 minutes to fetch the send queue.
// Returns at most 1 lead per user (oldest SEND_PENDING first), so each
// N8N run sends one message per user — natural rate-limit per WhatsApp.
//
// Auth: Authorization: Bearer <N8N_SHARED_TOKEN>
// Method: GET or POST
// Response: { items: [{ lead_id, user_id, lead, agency, context, phone }, ...], count }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  classifyRuntimeError,
  recordOperationalEvent,
  recordQueueMetric,
} from "../_shared/operational-telemetry.ts";
import { bearerToken, timingSafeEqualStr } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(supabaseUrl, serviceRoleKey);

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Constant-time, via the same helper `n8n-proxy` uses -- this is the same
  // secret (N8N_SHARED_TOKEN), and it used to be compared here with `!==` on
  // the whole header, which leaks how many leading bytes matched.
  const providedToken = bearerToken(req);
  const expectedToken = Deno.env.get("N8N_SHARED_TOKEN") ?? "";

  if (expectedToken.length === 0 || !timingSafeEqualStr(providedToken, expectedToken)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const startedAt = Date.now();
    const [batchResult, depthResult, oldestResult] = await Promise.all([
      admin.rpc("get_send_queue_batch"),
      admin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("status", "SEND_PENDING"),
      admin
        .from("leads")
        .select("updated_at")
        .eq("status", "SEND_PENDING")
        .order("updated_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);
    const { data, error } = batchResult;
    if (error) throw error;

    const items = (data ?? []).map((row: Record<string, unknown>) => ({
      lead_id: row.out_lead_id,
      user_id: row.out_user_id,
      lead: row.out_lead,
      agency: row.out_agency,
      context: row.out_context,
      phone: row.out_phone,
    }));

    if (!depthResult.error && !oldestResult.error) {
      const oldestAgeSeconds = oldestResult.data?.updated_at
        ? Math.max(
            0,
            Math.floor((Date.now() - new Date(oldestResult.data.updated_at).getTime()) / 1_000),
          )
        : null;
      await recordQueueMetric(admin, {
        queueName: "send_requests",
        queueDepth: depthResult.count ?? 0,
        source: "edge",
        oldestAgeSeconds,
        attributes: {
          queue_name: "send_requests",
          queue_depth: depthResult.count ?? 0,
          ...(oldestAgeSeconds === null
            ? {}
            : { oldest_age_seconds: oldestAgeSeconds }),
        },
      });
    } else {
      console.error("[send-queue-poll] queue_snapshot_failed code=DATABASE_ERROR");
    }

    await recordOperationalEvent(admin, {
      eventName: "queue.batch_claimed",
      source: "edge",
      operationType: "send_message",
      status: "completed",
      durationMs: Date.now() - startedAt,
      attributes: {
        action: "poll",
        queue_name: "send_requests",
        batch_size: items.length,
        result_count: items.length,
      },
    });

    return new Response(JSON.stringify({ items, count: items.length }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const errorCode = classifyRuntimeError(err, "DATABASE_ERROR");
    console.error(`[send-queue-poll] poll_failed code=${errorCode}`);
    await recordOperationalEvent(admin, {
      eventName: "queue.poll_failed",
      source: "edge",
      operationType: "send_message",
      status: "failed",
      errorCode,
      attributes: { action: "poll", queue_name: "send_requests" },
    });
    return new Response(
      JSON.stringify({ error: "Internal error", error_code: errorCode }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}
