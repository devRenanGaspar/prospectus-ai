import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import {
  parseFrontendTelemetryPayload,
  TelemetryValidationError,
} from "../_shared/frontend-telemetry.ts";

const MAX_BODY_BYTES = 32 * 1024;
const MAX_EVENTS_PER_SESSION_PER_MINUTE = 60;
const MAX_EVENTS_PER_USER_PER_MINUTE = 120;
const userRateWindows = new Map<string, { startedAt: number; eventCount: number }>();
const sessionRateWindows = new Map<string, { startedAt: number; eventCount: number }>();

function consumeRateLimit(
  windows: Map<string, { startedAt: number; eventCount: number }>,
  key: string,
  eventCount: number,
  maximum: number,
  now = Date.now(),
) {
  if (windows.size > 1_000) {
    for (const [storedKey, window] of windows) {
      if (now - window.startedAt > 120_000) windows.delete(storedKey);
    }
  }

  const current = windows.get(key);
  if (!current || now - current.startedAt >= 60_000) {
    windows.set(key, { startedAt: now, eventCount });
    return true;
  }
  if (current.eventCount + eventCount > maximum) {
    return false;
  }
  current.eventCount += eventCount;
  return true;
}

function allowedOrigins() {
  return new Set(
    (Deno.env.get("OBSERVABILITY_ALLOWED_ORIGINS") ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    Vary: "Origin",
  };
}

function jsonResponse(body: Record<string, unknown>, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(origin),
  });
}

export async function handler(request: Request): Promise<Response> {
  const origin = request.headers.get("Origin") ?? "";
  const origins = allowedOrigins();
  if (!origin || !origins.has(origin)) {
    return new Response(JSON.stringify({ error: "ORIGIN_NOT_ALLOWED" }), {
      status: origins.size === 0 ? 503 : 403,
      headers: { "Content-Type": "application/json", Vary: "Origin" },
    });
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405, origin);
  }

  const contentLength = Number(request.headers.get("Content-Length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return jsonResponse({ error: "PAYLOAD_TOO_LARGE" }, 413, origin);
  }

  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "UNAUTHORIZED" }, 401, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: "TELEMETRY_NOT_CONFIGURED" }, 503, origin);
  }

  const token = authHeader.slice("Bearer ".length);
  const authClient = createClient(supabaseUrl, anonKey);
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) {
    return jsonResponse({ error: "UNAUTHORIZED" }, 401, origin);
  }

  try {
    const bodyText = await request.text();
    if (new TextEncoder().encode(bodyText).byteLength > MAX_BODY_BYTES) {
      return jsonResponse({ error: "PAYLOAD_TOO_LARGE" }, 413, origin);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(bodyText);
    } catch {
      return jsonResponse({ error: "INVALID_JSON" }, 400, origin);
    }

    const events = parseFrontendTelemetryPayload(payload);
    if (
      !consumeRateLimit(
        userRateWindows,
        authData.user.id,
        events.length,
        MAX_EVENTS_PER_USER_PER_MINUTE,
      ) ||
      !consumeRateLimit(
        sessionRateWindows,
        events[0].session_id,
        events.length,
        MAX_EVENTS_PER_SESSION_PER_MINUTE,
      )
    ) {
      return jsonResponse({ error: "RATE_LIMITED" }, 429, origin);
    }
    const admin = createClient(supabaseUrl, serviceRoleKey);

    for (const event of events) {
      const { error } = await admin.rpc("record_operational_event", {
        _event_name: event.event_name,
        _source: "frontend",
        _event_id: event.event_id,
        _occurred_at: event.occurred_at,
        _session_id: event.session_id,
        _route_key: event.route_key,
        _duration_ms: event.duration_ms ?? null,
        _error_code: event.error_code ?? null,
        _attributes: event.attributes,
      });
      if (error) {
        console.error(`[frontend-telemetry] rpc_failed code=${error.code ?? "UNKNOWN"}`);
        return jsonResponse({ error: "TEMPORARILY_UNAVAILABLE" }, 503, origin);
      }
    }

    return jsonResponse({ accepted: events.length }, 202, origin);
  } catch (error) {
    if (error instanceof TelemetryValidationError) {
      return jsonResponse({ error: error.code }, error.status, origin);
    }
    console.error("[frontend-telemetry] unexpected_error code=UNEXPECTED");
    return jsonResponse({ error: "INTERNAL_ERROR" }, 500, origin);
  }
}
