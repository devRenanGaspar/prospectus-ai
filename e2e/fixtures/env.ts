import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Loads `.env.e2e` from the repo root. Hand-rolled rather than pulling in
 * `dotenv`: the parser is ten lines, and a dependency used only by `e2e/`
 * would have to be argued past `scripts/check-orphan-deps.mjs`.
 */
function loadEnvFile(): Record<string, string> {
  const path = resolve(process.cwd(), ".env.e2e");
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new Error(
      `.env.e2e not found at ${path}. Copy e2e/.env.example and fill in the three secrets.`,
    );
  }

  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const file = loadEnvFile();

function required(name: string): string {
  const value = process.env[name] ?? file[name];
  if (!value) {
    throw new Error(`Missing ${name}. Set it in .env.e2e (see e2e/.env.example).`);
  }
  return value;
}

/**
 * Every value the suite treats as a secret. `maskSecrets` scrubs these from
 * any string before it reaches a log line or an assertion message — the
 * service_role key in particular bypasses RLS entirely, and a Playwright
 * trace is a file that gets opened and shared.
 */
const SECRETS = [
  required("E2E_APP_PASSWORD"),
  required("E2E_SUPABASE_SERVICE_ROLE_KEY"),
  required("E2E_N8N_API_KEY"),
];

export function maskSecrets(text: string): string {
  let out = text;
  for (const secret of SECRETS) {
    if (secret.length >= 8) out = out.split(secret).join("«redacted»");
  }
  return out;
}

export const env = {
  // --- credentials (only these three come from the operator) ---
  appPassword: required("E2E_APP_PASSWORD"),
  supabaseServiceRoleKey: required("E2E_SUPABASE_SERVICE_ROLE_KEY"),
  n8nApiKey: required("E2E_N8N_API_KEY"),

  // --- app ---
  appUrl: file.E2E_APP_URL ?? "https://prospectus.ia.br",
  appEmail: file.E2E_APP_EMAIL ?? "renangasp@gmail.com",

  // --- supabase (production) ---
  supabaseUrl: file.E2E_SUPABASE_URL ?? "https://tumqhovjzjojmrfoshou.supabase.co",
  supabaseProjectRef: "tumqhovjzjojmrfoshou",
  /** Pre-migration project. Nothing live may reference it — see preflight. */
  deadProjectRef: "vninkmkoxplrcxdyxvvr",

  // --- n8n ---
  /** Editor + REST API host. NOT the webhook host. */
  n8nApiUrl: file.E2E_N8N_API_URL ?? "https://nned.comunidademaia.com",
  /** Webhook processor host. Serves /webhook/* only; has no /api/v1. */
  n8nWebhookUrl: file.E2E_N8N_WEBHOOK_URL ?? "https://nnwb.comunidademaia.com",

  // --- the fixed test lead and its account ---
  userId: "40090921-e613-45b8-b6ab-ac1c77383cbd",
  leadId: "cc9ab02a-16b1-4d16-89d6-c68c22b93d7b",
  leadPhone: "5513992102462",
  /** The account's WhatsApp number. Also the per-tenant table suffix. */
  agentPhone: "5513996020754",
  crmTable: "crm_5513996020754",
  agentMemoryTable: "n8n_5513996020754",
  /** Address the agent books the meeting invite to, in TESTE 5. */
  leadEmail: file.E2E_LEAD_EMAIL ?? "renangaspar@hotmail.com",

  // --- n8n workflow ids ---
  workflows: {
    sdrAgent: "Ix1qK7kZQMVBQh2Z",
    replyScorer: "syYTsi1gdqFBBnMR",
    schedulingTool: "zouM7ZXatR8sVEKT",
    sendQueue: "p6oQODuLzrCIxAO4",
    copyGeneration: "81elWC4D1rq6zw44",
    leadSearch: "z5ycff5GjkpaNtzh",
    setup: "oXEXHGTiCWgNlHR8",
    testSender: "GnSToI6nNV44rOoT",
    inboundHub: "d8hpnL6sjeXKLiUR",
  },

  // --- webhook paths (no auth on any of these) ---
  webhooks: {
    /** Sends a WhatsApp message AS the lead. Accepts { mensagem }. */
    testSender: "/webhook/561fd612-f968-41c5-adc5-ef45308eb865",
    /** Forces the send queue instead of waiting for the 15-minute schedule. */
    forceSendQueue: "/webhook/efc55a11-113b-4986-8cfa-8b2bd024a3f4",
  },

  // --- search parameters for TESTE 1 ---
  /**
   * The suite does NOT choose a niche. It uses whatever the account already has
   * saved in `profiles.context_icp`, and reads the expected `category_name`
   * from `niche_options.lead_category` at runtime.
   *
   * Two reasons. Picking a different niche in the dialog makes the app persist
   * it back to the profile — a write to the operator's real ICP, outside the
   * scope authorised for this suite. And the dialog's selects only render their
   * placeholder text while empty, so on a configured account there is no stable
   * string to click; anchoring on the saved value sidesteps that entirely.
   */
  search: {
    quantity: 2,
    /** Real searched leads carry the string "Brazil", not "BR". */
    expectedCountry: "Brazil",
  },
} as const;
