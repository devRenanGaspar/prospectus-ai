// Seed obviously-synthetic demo leads into the account identified by
// DEMO_EMAIL / DEMO_PASSWORD. Used to produce README screenshots without
// exposing any real lead data.
//
// Safety properties:
// - Runs authenticated as the demo user through RLS ("Users access own leads").
//   No service role involved.
// - Never seeds SEND_PENDING or COPY_PENDING: those are processing states —
//   SEND_PENDING is polled by the n8n send queue and would trigger a real
//   WhatsApp message.
// - Every phone number is an invalid 55 11 90000-00xx placeholder, except the
//   single conversation lead, whose number comes from DEMO_LEAD_PHONE (a phone
//   owned by the demo operator) so the live conversation reaches them.
// - Idempotent: each run first deletes leads tagged google_place_id LIKE
//   'DEMO-SYNTH-%' for this user, then inserts the fixed set.
//
// Usage:
//   DEMO_EMAIL=... DEMO_PASSWORD=... DEMO_LEAD_PHONE=55DDDNUMBER \
//     node scripts/demo/seed-synthetic-leads.mjs
//
// Cleanup: scripts/demo/cleanup-synthetic-leads.mjs
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

const { DEMO_EMAIL, DEMO_PASSWORD, DEMO_LEAD_PHONE } = process.env;
if (!DEMO_EMAIL || !DEMO_PASSWORD || !DEMO_LEAD_PHONE) {
  console.error("Missing DEMO_EMAIL / DEMO_PASSWORD / DEMO_LEAD_PHONE env vars.");
  process.exit(1);
}

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY);
const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
  email: DEMO_EMAIL,
  password: DEMO_PASSWORD,
});
if (authErr) { console.error("LOGIN FAILED:", authErr.message); process.exit(1); }
const uid = auth.user.id;

const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString();

// Copy text is pt-BR on purpose: it is user-facing product output.
const SAMPLE_COPY = (name, city) =>
  `Oi! Vi que a ${name} tem ótimas avaliações no Google aqui em ${city} — parabéns pelo trabalho. ` +
  `Trabalho com gestores de tráfego pago e ajudo negócios como o seu a transformar essa reputação em mais clientes. ` +
  `Posso te mostrar em 2 minutos como funciona?`;

// Obviously synthetic: "Exemplo", "Fictícia", "Demonstração"... names, invalid
// 90000-00xx phones, DEMO-SYNTH-* place ids.
const leads = [
  { n: 1, name: "Padaria Exemplo Ltda",          category_name: "Padaria",          city: "São Paulo", neighborhood: "Moema",        status: "NEW",             reviews_count: "184", rank: "4.7", phone: "5511900000001", created: 1 },
  { n: 2, name: "Academia Fictícia Corpo & Cia",  category_name: "Academia",         city: "São Paulo", neighborhood: "Pinheiros",    status: "NEW",             reviews_count: "312", rank: "4.5", phone: "5511900000002", created: 1 },
  { n: 3, name: "Clínica Demonstração Sorriso",   category_name: "Dentista",         city: "São Paulo", neighborhood: "Tatuapé",      status: "NEW",             reviews_count: "97",  rank: "4.9", phone: "5511900000003", created: 2 },
  { n: 4, name: "Restaurante Modelo Sabor Real",  category_name: "Restaurante",      city: "São Paulo", neighborhood: "Vila Mariana", status: "COPY_READY",      reviews_count: "521", rank: "4.4", phone: "5511900000004", created: 3, copy: true },
  { n: 5, name: "Pet Shop Protótipo Amigo Fiel",  category_name: "Pet Shop",         city: "São Paulo", neighborhood: "Perdizes",     status: "COPY_READY",      reviews_count: "143", rank: "4.8", phone: "5511900000005", created: 3, copy: true },
  { n: 6, name: "Barbearia Placeholder Premium",  category_name: "Barbearia",        city: "São Paulo", neighborhood: "Itaim Bibi",   status: "SENT",            reviews_count: "76",  rank: "4.6", phone: "5511900000006", created: 5, copy: true },
  { n: 7, name: "Studio Simulado de Pilates",     category_name: "Estúdio de Pilates", city: "São Paulo", neighborhood: "Brooklin",   status: "FOLLOW_UP",       reviews_count: "58",  rank: "5.0", phone: "5511900000007", created: 8, copy: true },
  { n: 8, name: "Imobiliária Hipotética Prime",   category_name: "Imobiliária",      city: "São Paulo", neighborhood: "Santana",      status: "SCHEDULED",       reviews_count: "231", rank: "4.3", phone: "5511900000008", created: 10, copy: true },
  { n: 9, name: "Auto Center Amostra Motors",     category_name: "Oficina Mecânica", city: "São Paulo", neighborhood: "Lapa",         status: "CLOSED_WON",      reviews_count: "402", rank: "4.6", phone: "5511900000009", created: 14, copy: true },
  { n: 10, name: "Floricultura Exemplar Jardim",  category_name: "Floricultura",     city: "São Paulo", neighborhood: "Butantã",      status: "CLOSED_LOST",     reviews_count: "29",  rank: "4.1", phone: "5511900000010", created: 14, copy: true },
  // The one lead that talks back: phone owned by the demo operator.
  // Starts in SENT (cold message "already sent"); the live conversation with
  // the SDR agent moves it forward for real.
  { n: 11, name: "Café Sintético da Esquina",     category_name: "Cafeteria",        city: "São Paulo", neighborhood: "Jardins",      status: "SENT",            reviews_count: "167", rank: "4.8", phone: DEMO_LEAD_PHONE, created: 4, copy: true, agent: true },
];

// Idempotency: remove previous demo seeds for this user, then insert.
const { error: delErr, count } = await supabase
  .from("leads")
  .delete({ count: "exact" })
  .eq("user_id", uid)
  .like("google_place_id", "DEMO-SYNTH-%");
if (delErr) { console.error("CLEANUP FAILED:", delErr.message); process.exit(1); }
console.log(`removed ${count ?? 0} previous demo leads`);

const rows = leads.map((l) => ({
  user_id: uid,
  name: l.name,
  status: l.status,
  category_name: l.category_name,
  city: l.city,
  state: "SP",
  country: "BR",
  neighborhood: l.neighborhood,
  phone: l.phone,
  reviews_count: l.reviews_count,
  rank: l.rank,
  google_place_id: `DEMO-SYNTH-${String(l.n).padStart(3, "0")}`,
  source: "demo-seed",
  ai_agent_enabled: l.agent === true,
  ai_generated_copy: l.copy ? SAMPLE_COPY(l.name, l.city) : null,
  created_at: daysAgo(l.created),
}));

const { data: inserted, error: insErr } = await supabase.from("leads").insert(rows).select("id, name, status, phone");
if (insErr) { console.error("INSERT FAILED:", insErr.message); process.exit(1); }

console.log(`inserted ${inserted.length} synthetic leads:`);
for (const r of inserted) console.log(`  [${r.status}] ${r.name} (${r.phone})`);
await supabase.auth.signOut();
