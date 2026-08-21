// Remove all synthetic demo leads (google_place_id LIKE 'DEMO-SYNTH-%') and
// their conversation messages from the account identified by DEMO_EMAIL /
// DEMO_PASSWORD. Counterpart of seed-synthetic-leads.mjs.
//
// Usage:
//   DEMO_EMAIL=... DEMO_PASSWORD=... node scripts/demo/cleanup-synthetic-leads.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const envFile = readFileSync(resolve(import.meta.dirname, "..", "..", ".env"), "utf8");
const env = Object.fromEntries(
  envFile.split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    })
);

const { DEMO_EMAIL, DEMO_PASSWORD } = process.env;
if (!DEMO_EMAIL || !DEMO_PASSWORD) {
  console.error("Missing DEMO_EMAIL / DEMO_PASSWORD env vars.");
  process.exit(1);
}

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY);
const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
  email: DEMO_EMAIL,
  password: DEMO_PASSWORD,
});
if (authErr) { console.error("LOGIN FAILED:", authErr.message); process.exit(1); }
const uid = auth.user.id;

const { data: demoLeads, error: selErr } = await supabase
  .from("leads")
  .select("id, name")
  .eq("user_id", uid)
  .like("google_place_id", "DEMO-SYNTH-%");
if (selErr) { console.error("SELECT FAILED:", selErr.message); process.exit(1); }

if (!demoLeads.length) {
  console.log("no demo leads found, nothing to clean");
  process.exit(0);
}

const ids = demoLeads.map((l) => l.id);

// Conversation messages attached to demo leads go first (if RLS grants it).
const { error: msgErr, count: msgCount } = await supabase
  .from("messages")
  .delete({ count: "exact" })
  .in("lead_id", ids);
if (msgErr) console.log("messages cleanup skipped:", msgErr.message);
else console.log(`removed ${msgCount ?? 0} messages`);

const { error: delErr, count } = await supabase
  .from("leads")
  .delete({ count: "exact" })
  .in("id", ids);
if (delErr) { console.error("DELETE FAILED:", delErr.message); process.exit(1); }
console.log(`removed ${count ?? 0} demo leads`);
await supabase.auth.signOut();
