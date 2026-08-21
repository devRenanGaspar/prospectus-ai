import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  classifyRuntimeError,
  recordOperationalEvent,
  safeAllowlistedValue,
  WEBHOOK_ACTIONS,
  WEBHOOK_EVENT_TYPES,
  webhookCorrelation,
} from "../_shared/operational-telemetry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// SSRF guard: only allow https to public hosts.
function isUrlSafe(rawUrl: string): { ok: boolean; reason?: string } {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "not_https" };

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return { ok: false, reason: "empty_host" };

  // Loopback / unspecified
  if (["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(host)) {
    return { ok: false, reason: "loopback" };
  }

  // IPv4 private / link-local / loopback / unspecified ranges
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [parseInt(ipv4[1]), parseInt(ipv4[2])];
    if (a === 10) return { ok: false, reason: "private_ipv4" };
    if (a === 127) return { ok: false, reason: "loopback" };
    if (a === 0) return { ok: false, reason: "unspecified" };
    if (a === 169 && b === 254) return { ok: false, reason: "link_local" };
    if (a === 192 && b === 168) return { ok: false, reason: "private_ipv4" };
    if (a === 172 && b >= 16 && b <= 31) return { ok: false, reason: "private_ipv4" };
  }

  // IPv6 private / link-local / loopback prefixes
  if (host.includes(":")) {
    if (/^(::1|fc[0-9a-f]{2}|fd[0-9a-f]{2}|fe80)/.test(host)) {
      return { ok: false, reason: "private_ipv6" };
    }
  }

  return { ok: true };
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestStartedAt = Date.now();
    // Validate auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.warn("[webhook-proxy] auth_rejected code=MISSING_AUTHORIZATION");
      return new Response(
        JSON.stringify({ error: "Unauthorized", reason: "missing_authorization_header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify user
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: authUser }, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authUser) {
      console.warn("[webhook-proxy] auth_rejected code=INVALID_SESSION");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = authUser.id;

    // Parse body
    const { type, action, payload } = await req.json();
    if (!type || !action) {
      return new Response(JSON.stringify({ error: "Missing type or action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Lookup webhook config using service role
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const safeType = safeAllowlistedValue(type, WEBHOOK_EVENT_TYPES);
    const safeAction = safeAllowlistedValue(action, WEBHOOK_ACTIONS);
    const correlation = webhookCorrelation(type, payload);
    const correlationId = correlation.correlationId ?? crypto.randomUUID();
    const operationType =
      safeType === "find_leads"
        ? "find_leads"
        : safeType === "copy_generation_requested"
          ? "generate_copy"
          : safeType === "message_sent"
            ? "send_message"
            : "webhook_dispatch";
    const recordWebhookState = (
      eventName: "webhook.dispatched" | "webhook.completed" | "webhook.failed",
      status: "dispatched" | "completed" | "failed" | "timed_out",
      errorCode: string | null = null,
      httpStatus: number | null = null,
    ) =>
      recordOperationalEvent(adminClient, {
        eventName,
        source: "edge",
        correlationId,
        requestId: correlation.requestId,
        operationType,
        status,
        durationMs: Date.now() - requestStartedAt,
        errorCode,
        attributes: {
          action: safeAction,
          operation_stage: safeType,
          provider: "n8n",
          ...(httpStatus === null ? {} : { http_status: httpStatus }),
        },
      });

    // Inactive (BLOCKED) accounts cannot trigger any automation — even with a
    // still-valid JWT, the proxy refuses.
    //
    // The refusal is written as "proceed only if the role was read and is not
    // BLOCKED", not as "refuse if the role is BLOCKED". The difference is the
    // direction of failure: a discarded error leaves `callerProfile` null, and
    // a bare `role === "BLOCKED"` test reads null as "not blocked" and lets the
    // request through. A lookup that could not establish who is calling has to
    // refuse, not assume.
    const { data: callerProfile, error: callerProfileError } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();
    if (callerProfileError || !callerProfile || callerProfile.role === "BLOCKED") {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Paid operations triggered by push (webhook) must reference a request
    // that was already created and charged on the server. Beyond requiring the
    // request, the parameters that determine cost (lead_ids / quantity) are
    // read from that SAME record and overwrite whatever the client sent —
    // that way there's no way to pay for 1 and ask for 1000 in the payload.
    const paidOverride: Record<string, unknown> = {};

    if (type === "copy_generation_requested") {
      const copyReqId = (payload as Record<string, unknown> | undefined)?.copy_request_id;
      if (!copyReqId || typeof copyReqId !== "string") {
        return new Response(JSON.stringify({ error: "copy_request_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: cr } = await adminClient
        .from("copy_requests")
        .select("id, user_id, status, lead_ids")
        .eq("id", copyReqId)
        .maybeSingle();
      if (!cr || cr.user_id !== userId || cr.status !== "processing") {
        return new Response(JSON.stringify({ error: "Invalid or unpaid copy_request" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      paidOverride.lead_ids = cr.lead_ids;
    }

    // find_leads requires a 'pending'/'processing' lead_search owned by the
    // same user (created by request_find_leads, which charged for it). This
    // closes the direct paid-search path.
    if (type === "find_leads") {
      const searchId = (payload as Record<string, unknown> | undefined)?.search_id;
      if (!searchId || typeof searchId !== "string") {
        return new Response(JSON.stringify({ error: "search_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: sr } = await adminClient
        .from("lead_searches")
        .select("id, user_id, status, quantity_requested, limit_per_niche")
        .eq("id", searchId)
        .maybeSingle();
      if (!sr || sr.user_id !== userId || !["pending", "processing"].includes(sr.status)) {
        return new Response(JSON.stringify({ error: "Invalid or unpaid search" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      paidOverride.quantity = sr.quantity_requested;
      paidOverride.limit_per_niche = sr.limit_per_niche;
    }

    const { data: config, error: configError } = await adminClient
      .from("webhook_configs")
      .select("url, timeout_seconds")
      .eq("type", type)
      .eq("is_active", true)
      .single();

    if (configError || !config) {
      await recordWebhookState("webhook.failed", "failed", "WEBHOOK_NOT_CONFIGURED");
      return new Response(
        JSON.stringify({ error: "Webhook not configured" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // SSRF guard before issuing the outbound fetch
    const safety = isUrlSafe(config.url);
    if (!safety.ok) {
      console.error("[webhook-proxy] dispatch_blocked code=UNSAFE_DESTINATION");
      await recordWebhookState("webhook.failed", "failed", "UNSAFE_DESTINATION");
      return new Response(
        JSON.stringify({ error: "Invalid webhook URL", reason: safety.reason }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Forward request to webhook URL with timeout (+5s margin)
    const timeoutMs = (config.timeout_seconds + 5) * 1000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();
    const dispatchedTelemetry = recordWebhookState("webhook.dispatched", "dispatched");

    let webhookResponse: Response;
    try {
      webhookResponse = await fetch(config.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // paidOverride and user_id come AFTER the spread: the charged
        // parameters and the authenticated id are authoritative and cannot be
        // tampered with by the client's payload.
        body: JSON.stringify({
          action,
          ...(payload ?? {}),
          ...paidOverride,
          user_id: userId,
          correlation_id: correlationId,
          request_id: correlation.requestId,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      const elapsed = Date.now() - startedAt;
      const isTimeout = fetchError instanceof DOMException && fetchError.name === "AbortError";
      const errorCode = classifyRuntimeError(fetchError, "UPSTREAM_UNAVAILABLE");
      console.error(
        `[webhook-proxy] dispatch_failed code=${errorCode} elapsed_ms=${elapsed}`,
      );
      await dispatchedTelemetry;
      await recordWebhookState(
        "webhook.failed",
        isTimeout ? "timed_out" : "failed",
        errorCode,
      );
      return new Response(
        JSON.stringify({
          error: isTimeout ? "Webhook timeout" : "Webhook request failed",
        }),
        {
          status: isTimeout ? 504 : 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
    await dispatchedTelemetry;

    // Read body as text first, then try JSON
    const elapsed = Date.now() - startedAt;
    let bodyText = "";
    try {
      bodyText = await webhookResponse.text();
    } catch (readErr) {
      console.error(
        `[webhook-proxy] response_read_failed code=UPSTREAM_READ_ERROR status=${webhookResponse.status} elapsed_ms=${elapsed}`,
      );
      await recordWebhookState(
        "webhook.failed",
        "failed",
        "UPSTREAM_READ_ERROR",
        webhookResponse.status,
      );
      return new Response(
        JSON.stringify({
          error: "Webhook response read failed",
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(
      `[webhook-proxy] dispatch_finished type=${safeType} action=${safeAction} status=${webhookResponse.status} elapsed_ms=${elapsed}`,
    );

    // Try to parse JSON
    let parsed: unknown = null;
    let parseFailed = false;
    if (bodyText.length > 0) {
      try {
        parsed = JSON.parse(bodyText);
      } catch {
        parseFailed = true;
      }
    }

    // Upstream returned non-2xx
    if (!webhookResponse.ok) {
      console.error(
        `[webhook-proxy] upstream_rejected code=UPSTREAM_HTTP_ERROR status=${webhookResponse.status}`,
      );
      await recordWebhookState(
        "webhook.failed",
        "failed",
        "UPSTREAM_HTTP_ERROR",
        webhookResponse.status,
      );
      return new Response(
        JSON.stringify({
          error: "Upstream webhook returned error",
          upstream_status: webhookResponse.status,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 2xx but body wasn't valid JSON
    if (parseFailed) {
      console.error("[webhook-proxy] response_rejected code=UPSTREAM_INVALID_RESPONSE");
      await recordWebhookState(
        "webhook.failed",
        "failed",
        "UPSTREAM_INVALID_RESPONSE",
        webhookResponse.status,
      );
      return new Response(
        JSON.stringify({
          error: "Webhook returned invalid response",
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2xx with empty body
    if (parsed === null) {
      await recordWebhookState(
        "webhook.completed",
        "completed",
        null,
        webhookResponse.status,
      );
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await recordWebhookState(
      "webhook.completed",
      "completed",
      null,
      webhookResponse.status,
    );
    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(
      `[webhook-proxy] internal_error code=${classifyRuntimeError(err)}`,
    );
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}
