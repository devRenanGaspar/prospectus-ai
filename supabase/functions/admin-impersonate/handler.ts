import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { classifyRuntimeError } from "../_shared/operational-telemetry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_ORIGINS = [
  "https://prospectus.ia.br",
  "https://prospectus.comunidademaia.com.br",
];

const getSafeRedirectUrl = (redirectTo: unknown) => {
  if (typeof redirectTo !== "string") return `${ALLOWED_ORIGINS[0]}/dashboard`;

  try {
    const url = new URL(redirectTo);
    if (ALLOWED_ORIGINS.includes(url.origin) && url.pathname.startsWith("/dashboard")) {
      return url.toString();
    }
  } catch {
    // Invalid URLs fall back to the production app dashboard.
  }

  return `${ALLOWED_ORIGINS[0]}/dashboard`;
};

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabaseUser.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const callerId = claims.claims.sub as string;

    const { data: callerProfile } = await supabaseUser
      .from("profiles")
      .select("role")
      .eq("id", callerId)
      .single();

    if (callerProfile?.role !== "ADMIN") {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }

    const { target_user_id, redirect_to } = await req.json();
    if (!target_user_id || typeof target_user_id !== "string") {
      return new Response(JSON.stringify({ error: "target_user_id is required" }), { status: 400, headers: corsHeaders });
    }

    if (target_user_id === callerId) {
      return new Response(JSON.stringify({ error: "Cannot impersonate yourself" }), { status: 400, headers: corsHeaders });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: targetProfile, error: targetErr } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, role")
      .eq("id", target_user_id)
      .single();

    if (targetErr || !targetProfile) {
      return new Response(JSON.stringify({ error: "Target user not found" }), { status: 404, headers: corsHeaders });
    }

    if (targetProfile.role === "ADMIN") {
      return new Response(JSON.stringify({ error: "Cannot impersonate another admin" }), { status: 403, headers: corsHeaders });
    }

    if (targetProfile.role === "BLOCKED") {
      return new Response(JSON.stringify({ error: "Cannot impersonate a blocked user" }), { status: 403, headers: corsHeaders });
    }

    if (!targetProfile.email) {
      return new Response(JSON.stringify({ error: "Target user has no email" }), { status: 400, headers: corsHeaders });
    }

    const safeRedirectTo = getSafeRedirectUrl(redirect_to);

    // The audit record goes in BEFORE the link is minted, and the request is
    // refused if it cannot be written. A failed insert means a magic link for
    // someone else's account exists with no record that it was ever issued.
    //
    // Symmetric with admin-update-password on purpose. Two audit paths with
    // different guarantees is how one of them quietly becomes the weak one.
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || null;
    const ua = req.headers.get("user-agent") || null;

    const { data: auditRow, error: auditErr } = await supabaseAdmin
      .from("admin_impersonation_logs")
      .insert({
        admin_id: callerId,
        target_user_id: targetProfile.id,
        target_email: targetProfile.email,
        ip_address: ip,
        user_agent: ua,
        outcome: "pending",
      })
      .select("id")
      .single();

    if (auditErr || !auditRow) {
      const errorCode = classifyRuntimeError(auditErr);
      console.error(`[admin-impersonate] audit_write_failed code=${errorCode}`);
      return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: corsHeaders });
    }

    // Generate magic link
    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: targetProfile.email,
      options: {
        redirectTo: safeRedirectTo,
      },
    });

    if (linkErr || !linkData?.properties?.action_link) {
      // This mints a magic link for another user; the caller must not see
      // why generateLink failed. Same standard as the outer catch below.
      if (linkErr) {
        const errorCode = classifyRuntimeError(linkErr);
        console.error(`[admin-impersonate] generate_link_failed code=${errorCode}`);
      }
      const { error: markErr } = await supabaseAdmin
        .from("admin_impersonation_logs")
        .update({ outcome: "failed" })
        .eq("id", auditRow.id);
      if (markErr) console.error(`[admin-impersonate] audit_mark_failed outcome=failed`);
      return new Response(JSON.stringify({ error: "Failed to generate link" }), { status: 500, headers: corsHeaders });
    }

    const { error: sealErr } = await supabaseAdmin
      .from("admin_impersonation_logs")
      .update({ outcome: "succeeded" })
      .eq("id", auditRow.id);
    if (sealErr) {
      // The link exists by now. Returning an error would hide a link that was
      // already minted, which is worse than a row that says 'pending' -- and
      // 'pending' is true: it started, and the outcome was not recorded.
      console.error(`[admin-impersonate] audit_mark_failed outcome=succeeded`);
    }

    return new Response(
      JSON.stringify({
        action_link: linkData.properties.action_link,
        target: {
          id: targetProfile.id,
          full_name: targetProfile.full_name,
          email: targetProfile.email,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    // The stack trace stays on the server. This endpoint mints magic links for
    // other users, so the response must not describe why it failed.
    const errorCode = classifyRuntimeError(err);
    console.error(`[admin-impersonate] handler_failed code=${errorCode}`);
    return new Response(
      JSON.stringify({ error: "Internal error", error_code: errorCode }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}
