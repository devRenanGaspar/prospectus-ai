import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { classifyRuntimeError } from "../_shared/operational-telemetry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    // Verify caller is admin
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

    const { data: profile } = await supabaseUser.from("profiles").select("role").eq("id", callerId).single();
    if (profile?.role !== "ADMIN") {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }

    // Parse body
    const { user_id, new_password } = await req.json();
    if (!user_id || !new_password || typeof new_password !== "string" || new_password.length < 6) {
      return new Response(JSON.stringify({ error: "user_id and new_password (min 6 chars) are required" }), { status: 400, headers: corsHeaders });
    }

    // Use service role to update password
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: target, error: targetErr } = await supabaseAdmin
      .from("profiles")
      .select("id, role, email")
      .eq("id", user_id)
      .single();

    if (targetErr || !target) {
      return new Response(JSON.stringify({ error: "Target user not found" }), { status: 404, headers: corsHeaders });
    }

    // An admin cannot change ANOTHER admin's password: that would be an
    // untraceable account takeover. Changing one's own is still allowed.
    if (target.role === "ADMIN" && target.id !== callerId) {
      return new Response(
        JSON.stringify({ error: "Cannot change another admin's password" }),
        { status: 403, headers: corsHeaders },
      );
    }

    // The audit record is written BEFORE the password changes, and the
    // request is refused if it cannot be written. Written after, a failed
    // insert leaves an already-changed password that aborting cannot undo;
    // written before, no privileged action happens without a trace of the
    // intent. The row starts as 'pending' and is resolved below. See
    // migration 20260820120000.
    const { data: auditRow, error: auditErr } = await supabaseAdmin
      .from("admin_password_reset_logs")
      .insert({
        admin_id: callerId,
        target_user_id: target.id,
        target_email: target.email,
        ip_address: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || null,
        user_agent: req.headers.get("user-agent") || null,
        outcome: "pending",
      })
      .select("id")
      .single();

    if (auditErr || !auditRow) {
      const errorCode = classifyRuntimeError(auditErr);
      console.error(`[admin-update-password] audit_write_failed code=${errorCode}`);
      return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: corsHeaders });
    }

    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(user_id, { password: new_password });
    if (updateErr) {
      // This sets another user's password; the caller must not see why the
      // provider call failed. Same standard as the outer catch below.
      const errorCode = classifyRuntimeError(updateErr);
      console.error(`[admin-update-password] update_failed code=${errorCode}`);
      const { error: markErr } = await supabaseAdmin
        .from("admin_password_reset_logs")
        .update({ outcome: "failed" })
        .eq("id", auditRow.id);
      // Cannot abort on this one -- the attempt is already recorded and the
      // password was not changed. A row stuck at 'pending' is the honest
      // record of "we do not know", and this table's (outcome, created_at)
      // index exists so those are cheap to find.
      if (markErr) console.error(`[admin-update-password] audit_mark_failed outcome=failed`);
      return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: corsHeaders });
    }

    const { error: sealErr } = await supabaseAdmin
      .from("admin_password_reset_logs")
      .update({ outcome: "succeeded" })
      .eq("id", auditRow.id);
    if (sealErr) {
      // The password IS changed at this point. Failing the response would tell
      // the admin nothing happened, which is the more dangerous lie: they
      // would try again, or assume the old password still works. The row stays
      // 'pending', which reads as "started, outcome unknown" -- true.
      console.error(`[admin-update-password] audit_mark_failed outcome=succeeded`);
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    // The stack trace stays on the server. This endpoint sets other users'
    // passwords, so the response must not describe why it failed.
    const errorCode = classifyRuntimeError(err);
    console.error(`[admin-update-password] handler_failed code=${errorCode}`);
    return new Response(
      JSON.stringify({ error: "Internal error", error_code: errorCode }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}
