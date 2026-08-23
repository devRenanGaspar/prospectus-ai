import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { classifyRuntimeError } from "../_shared/operational-telemetry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_ORIGINS = [
  "https://prospectus.ia.br",
  "https://prospectus.comunidademaia.com.br",
];

function b64url(bytes: Uint8Array): string {
  const s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signState(payload: object, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const data = b64url(enc.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return `${data}.${b64url(new Uint8Array(sig))}`;
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const stateSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;

    // Get origin from request body and validate against allowlist
    let requestedOrigin = "";
    try {
      const body = await req.json();
      requestedOrigin = body.origin || "";
    } catch { /* no body */ }

    const origin = ALLOWED_ORIGINS.includes(requestedOrigin)
      ? requestedOrigin
      : ALLOWED_ORIGINS[0];

    const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
    const redirectUri = `${supabaseUrl}/functions/v1/google-calendar-callback`;

    // Sign state payload to prevent forgery
    const state = await signState(
      { user_id: userId, origin, iat: Date.now() },
      stateSecret,
    );

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email",
      access_type: "offline",
      prompt: "consent",
      state,
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    return new Response(JSON.stringify({ url: authUrl }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const errorCode = classifyRuntimeError(err);
    console.error(`[google-calendar-auth-url] handler_failed code=${errorCode}`);
    return new Response(JSON.stringify({ error: "Internal error", error_code: errorCode }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}
