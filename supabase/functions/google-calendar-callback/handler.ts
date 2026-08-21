import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://prospectus.ia.br",
  "https://prospectus.comunidademaia.com.br",
];
const DEFAULT_ORIGIN = ALLOWED_ORIGINS[0];
const STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

function b64urlDecode(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i];
  return r === 0;
}

async function verifyState(
  state: string,
  secret: string,
): Promise<{ user_id: string; origin: string; iat: number } | null> {
  const parts = state.split(".");
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, enc.encode(data)),
  );
  let provided: Uint8Array;
  try {
    provided = b64urlDecode(sig);
  } catch {
    return null;
  }
  if (!timingSafeEqual(expected, provided)) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(data)));
    if (typeof payload.user_id !== "string" || typeof payload.iat !== "number") return null;
    if (Date.now() - payload.iat > STATE_MAX_AGE_MS) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function handler(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const stateRaw = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const stateSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify signed state
    let userId = "";
    let appOrigin = DEFAULT_ORIGIN;
    if (stateRaw) {
      const verified = await verifyState(stateRaw, stateSecret);
      if (verified) {
        userId = verified.user_id;
        appOrigin = ALLOWED_ORIGINS.includes(verified.origin)
          ? verified.origin
          : DEFAULT_ORIGIN;
      }
    }

    if (error || !code || !userId) {
      return Response.redirect(
        `${appOrigin}/settings?google_calendar=error&reason=${error || "invalid_state"}`,
        302,
      );
    }

    const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
    const redirectUri = `${supabaseUrl}/functions/v1/google-calendar-callback`;

    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.refresh_token) {
      console.error("Token exchange failed:", tokenData);
      return Response.redirect(
        `${appOrigin}/settings?google_calendar=error&reason=token_exchange`,
        302,
      );
    }

    // Get user email from Google
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userInfo = await userInfoRes.json();
    const googleEmail = userInfo.email || null;

    // Save using service role. The refresh token lives in user_google_tokens,
    // which has no anon/authenticated access at all. `profiles` only stores
    // email and connected_at, which the UI needs and aren't secret.
    const admin = createClient(supabaseUrl, stateSecret);

    const { error: tokenError } = await admin
      .from("user_google_tokens")
      .upsert(
        {
          user_id: userId,
          refresh_token: tokenData.refresh_token,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    if (tokenError) {
      console.error("Token save failed:", tokenError);
      return Response.redirect(
        `${appOrigin}/settings?google_calendar=error&reason=save_failed`,
        302,
      );
    }

    const { error: updateError } = await admin
      .from("profiles")
      .update({
        google_calendar_email: googleEmail,
        google_calendar_connected_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (updateError) {
      console.error("Profile update failed:", updateError);
      return Response.redirect(
        `${appOrigin}/settings?google_calendar=error&reason=save_failed`,
        302,
      );
    }

    return Response.redirect(`${appOrigin}/settings?google_calendar=success`, 302);
  } catch (err) {
    console.error("google-calendar-callback error:", err);
    return Response.redirect(
      `${DEFAULT_ORIGIN}/settings?google_calendar=error&reason=server_error`,
      302,
    );
  }
}
