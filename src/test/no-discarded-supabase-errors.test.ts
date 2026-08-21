/**
 * The gate for the "swallowed failure" class: a Supabase call whose `error` is
 * never looked at.
 *
 * `discarded-errors.test.tsx` covers *instances* — it renders hooks and proves
 * a failure reaches the UI. This file is the ratchet underneath it: a static
 * scan that fails when a new discarded error appears anywhere in `src/` or
 * `supabase/functions/`.
 *
 * Two shapes are scanned, because a gate that caught only the first would be
 * the same defect this file exists to prevent — a check whose name is wider
 * than its reach:
 *
 * 1. `const { data } = await supabase...` — the destructuring names `data` and
 *    not `error`, so the error is dropped at the call site.
 * 2. `await supabase.from(...).insert(...)` with the result discarded entirely.
 *    This is the shape the audit did not report and the plan did not
 *    anticipate: measured on 2026-08-20, fifteen of them.
 *
 * **Scope, stated plainly.** A bare `const { data` matches **103 times** across
 * these directories, most of them `useQuery`/`useMutation` results that have no
 * PostgREST `error` to check. Scoping the match to expressions that touch
 * `supabase`/`admin`/`.from(`/`.rpc(`/`.functions.invoke(` brings it to 24. An
 * allow-list of 79 exceptions would not be a gate; it would be an empty catch
 * spread over a file.
 *
 * **The allow-list below is a ratchet, not an endorsement.** Each entry is a
 * call this change deliberately did not rewrite, with the reason. New ones do
 * not get added silently — adding one is a diff a reviewer sees.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOTS = ["src", "supabase/functions"];

/**
 * Calls whose discarded error is accepted, and why.
 *
 * The rule that separates these from the ones this change fixed: **does
 * something promise that this call happened?** An audit log promised by a
 * migration comment, an idempotency ledger that decides whether money moves
 * twice — those were fixed. A status mirror that will be refreshed on the next
 * poll, or a lookup whose caller already handles "not found", is accepted.
 */
const ALLOWED: Record<string, string> = {
  // -- Lookups whose caller already treats a null result as "not found" ------
  "supabase/functions/n8n-proxy/handler.ts:findLeadTable:leads":
    "findLeadTable returns null and every caller handles the not-found branch",
  "supabase/functions/n8n-proxy/handler.ts:findLeadTable:leads_reserve":
    "the fallback half of the same helper, with the same null-means-not-found contract",
  "supabase/functions/n8n-proxy/handler.ts:subscription_events:prior":
    "informational only: the idempotency claim already failed with 23505, so the response is correct with or without the prior row",

  // -- Authorization reads that fail closed ---------------------------------
  "supabase/functions/admin-impersonate/handler.ts:profiles:callerProfile":
    "a failed read leaves callerProfile null, which the next line answers with 403 -- failing closed is the correct direction",
  "supabase/functions/admin-update-password/handler.ts:profiles:profile":
    "a failed read leaves the caller unidentified, and the next line answers 403 rather than proceeding",
  "supabase/functions/webhook-proxy/handler.ts:profiles:callerProfile":
    "identical shape to the two admin functions: a null result is refused, not assumed authorized",
  "supabase/functions/webhook-proxy/handler.ts:copy_requests:cr":
    "a failed read leaves cr null and the request is refused rather than dispatched",
  "supabase/functions/webhook-proxy/handler.ts:lead_searches:sr":
    "a failed read leaves sr null and the search dispatch is refused rather than issued blind",

  // -- Writes that mirror state something else re-establishes ---------------
  "src/hooks/useWhatsApp.ts:profiles:update": "whatsapp_status mirrors the provider; the next poll re-establishes it",
  "src/hooks/useLeadDetail.ts:leads:update": "last_message_at and ai_agent_enabled are re-read on the next fetch; the mutation path that matters already surfaces its error",
  "src/components/OnboardingModal.tsx:profiles:update": "a lost write means the modal shows once more, which is visible to the user rather than hidden from them",
  "supabase/functions/n8n-proxy/handler.ts:lead_searches:update": "search bookkeeping; the row is reconciled by the same workflow's next call",
  "supabase/functions/n8n-proxy/handler.ts:leads:update": "last_message_at bookkeeping, re-established by the next inbound message",
  "supabase/functions/n8n-proxy/handler.ts:profiles:upsert": "defensive upsert of a row that the claim above already required to exist",
};

function sources(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "test") sources(full, acc);
    } else if (/\.tsx?$/.test(entry.name)) {
      acc.push(full.split("\\").join("/"));
    }
  }
  return acc;
}

/** Expressions that reach PostgREST, GoTrue or an edge function. */
const SUPABASE_CALL = /(?:supabase|supabaseAdmin|supabaseUser|admin|adminClient)\s*\.|\.from\(|\.rpc\(|functions\.invoke\(/;

/** `const { ... } = await <expr>;` */
const DESTRUCTURED = /const\s*\{([^}]*)\}\s*=\s*await\s+([\s\S]*?);/g;

/** A statement that is nothing but `await <expr>;`, result thrown away. */
const BARE_AWAIT = /(?:^|\n)[ \t]*await\s+((?:supabase|supabaseAdmin|supabaseUser|admin|adminClient)[\s\S]*?);/g;

/** Writes. A discarded read is often fine; a discarded write is a lost fact. */
const WRITE = /\.(insert|update|upsert|delete)\(/;

type Finding = { file: string; line: number; snippet: string; table: string; binding: string };

function scan(): Finding[] {
  const found: Finding[] = [];
  for (const root of ROOTS) {
    for (const file of sources(resolve(process.cwd(), root)).map((f) =>
      f.slice(f.toLowerCase().indexOf(root.toLowerCase())),
    )) {
      const source = readFileSync(file, "utf8");

      for (const match of source.matchAll(DESTRUCTURED)) {
        const [, pattern, expression] = match;
        if (!SUPABASE_CALL.test(expression)) continue;
        if (/\berror\b/.test(pattern)) continue;
        found.push({
          file,
          line: source.slice(0, match.index).split("\n").length,
          snippet: expression.replace(/\s+/g, " ").slice(0, 90),
          table: expression.match(/\.from\("([a-z_]+)"\)/)?.[1] ?? expression.match(/\.rpc\("([a-z_]+)"/)?.[1] ?? "",
          binding: pattern.replace(/\s+/g, " ").split(":").pop()?.trim() ?? "",
        });
      }

      for (const match of source.matchAll(BARE_AWAIT)) {
        const expression = match[1];
        if (!WRITE.test(expression)) continue;
        found.push({
          file,
          line: source.slice(0, match.index).split("\n").length + 1,
          snippet: expression.replace(/\s+/g, " ").slice(0, 90),
          table: expression.match(/\.from\("([a-z_]+)"\)/)?.[1] ?? "",
          // The operation, so an allow-listed upsert does not silently cover a
          // later update to the same table in the same file.
          binding: expression.match(WRITE)?.[1] ?? "",
        });
      }
    }
  }
  return found;
}

/** The keys the allow-list is written against. */
function keysFor(finding: Finding): string[] {
  const keys = finding.binding
    ? [`${finding.file}:${finding.table}:${finding.binding}`]
    : [`${finding.file}:${finding.table}`];
  // findLeadTable's two reads sit in a helper, not a case block, and both hit
  // different tables -- named directly so the entry reads as what it is.
  keys.push(`${finding.file}:findLeadTable:${finding.table}`);
  return keys;
}

describe("no new discarded Supabase errors", () => {
  const findings = scan();

  it("finds the call sites it is supposed to be checking", () => {
    // Guards the guard. A regex that stopped matching would empty the result
    // set and turn this into a passing check of nothing -- which is how two
    // gates in this repository stayed green over defects for a day each.
    expect(findings.length).toBeGreaterThan(10);
  });

  it("every discarded error is one the allow-list names, with a reason", () => {
    const unlisted = findings
      .filter((f) => !keysFor(f).some((key) => key in ALLOWED))
      .map((f) => `${f.file}:${f.line} — ${f.snippet}`)
      .sort();

    expect(unlisted).toEqual([]);
  });

  it("has no allow-list entry for a call that no longer exists", () => {
    // A stale exemption is how a gate silently loosens: the code gets fixed,
    // the entry stays, and the next call at that path inherits the pass.
    const live = new Set(findings.flatMap(keysFor));
    expect(Object.keys(ALLOWED).filter((key) => !live.has(key)).sort()).toEqual([]);
  });

  it("gives a reason for every entry, not just a path", () => {
    for (const [key, reason] of Object.entries(ALLOWED)) {
      expect(reason.length, key).toBeGreaterThan(20);
    }
  });

  it("does not allow-list the audit logs or the credit ledger", () => {
    // The three tables where a lost write is a lost fact someone was promised.
    // If one of these ever appears in the allow-list, the exemption is the
    // defect.
    const promised = ["admin_password_reset_logs", "admin_impersonation_logs", "subscription_events"];
    for (const key of Object.keys(ALLOWED)) {
      for (const table of promised) {
        if (key.includes(`:${table}`) && !key.endsWith(":prior")) {
          throw new Error(`${table} must not be allow-listed: ${key}`);
        }
      }
    }
    expect(promised.length).toBe(3);
  });
});
