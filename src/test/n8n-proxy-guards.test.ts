import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { bearerToken, timingSafeEqualStr } from "../../supabase/functions/_shared/auth";
import {
  LEAD_UPDATE_COLUMNS,
  pickInsertableLeadColumns,
  pickUpdatableLeadColumns,
} from "../../supabase/functions/_shared/lead-columns";
import {
  CALENDAR_ACTIONS,
  isAuthorizedForAction,
  SENSITIVE_ACTIONS,
} from "../../supabase/functions/_shared/sensitive-actions";
import { N8N_ACTIONS } from "../../supabase/functions/_shared/operational-telemetry";

// These import the *same modules the deployed edge functions import*, not a
// mirror of them. That distinction is the point of the file: this repo already
// has `src/lib/n8n-proxy-contract.ts`, a zod description of nine n8n actions
// whose only importer is its own test. A test against a mirror stays green
// while the function it describes regresses, so the guards were pulled out into
// `supabase/functions/_shared/` where both Deno and Vitest can reach them.

describe("timingSafeEqualStr", () => {
  it("accepts identical strings", () => {
    expect(timingSafeEqualStr("N8N-TOKEN-123", "N8N-TOKEN-123")).toBe(true);
  });

  it("rejects different strings of the same length", () => {
    expect(timingSafeEqualStr("N8N-TOKEN-123", "N8N-TOKEN-124")).toBe(false);
  });

  it("rejects strings of different lengths", () => {
    expect(timingSafeEqualStr("short", "considerably-longer")).toBe(false);
  });

  it("rejects an empty candidate against a real secret", () => {
    // The failure mode this covers: an unset env var making both sides "",
    // which a naive equality check would treat as a successful match.
    expect(timingSafeEqualStr("", "N8N-TOKEN-123")).toBe(false);
  });
});

describe("bearerToken", () => {
  const withHeaders = (headers: Record<string, string>) =>
    ({ headers: new Headers(headers) }) as Request;

  it("extracts the token from a Bearer header", () => {
    expect(bearerToken(withHeaders({ Authorization: "Bearer abc123" }))).toBe("abc123");
  });

  it("returns an empty string when the header is missing", () => {
    expect(bearerToken(withHeaders({}))).toBe("");
  });

  it("returns an empty string for a non-Bearer scheme", () => {
    expect(bearerToken(withHeaders({ Authorization: "Basic abc123" }))).toBe("");
  });
});

describe("pickUpdatableLeadColumns", () => {
  it("rejects the ownership columns that allowed cross-tenant reassignment", () => {
    // This is the actual hole: `n8n-proxy` runs as service_role, so a payload
    // carrying `user_id` moved the lead to another account with no RLS in the
    // way. Each of these is asserted by name rather than as a set, so removing
    // one from the deny-list fails here loudly.
    for (const column of ["user_id", "assigned_user_id", "search_id", "id", "created_at"]) {
      const { allowed, rejected } = pickUpdatableLeadColumns({ [column]: "x" });
      expect(allowed).toEqual({});
      expect(rejected).toEqual([column]);
      expect(LEAD_UPDATE_COLUMNS.has(column)).toBe(false);
    }
  });

  it("names an unknown column instead of dropping it", () => {
    // Silently discarding would let n8n believe the write happened.
    const { allowed, rejected } = pickUpdatableLeadColumns({
      status: "SENT",
      not_a_column: 1,
    });
    expect(allowed).toEqual({ status: "SENT" });
    expect(rejected).toEqual(["not_a_column"]);
  });

  it("passes the columns n8n legitimately writes", () => {
    const updates = {
      status: "COPY_READY",
      mensagem_abordagem_comercial: "olá",
      phone: "5511900000000",
      website_analysis: "...",
    };
    const { allowed, rejected } = pickUpdatableLeadColumns(updates);
    expect(allowed).toEqual(updates);
    expect(rejected).toEqual([]);
  });

  it("keeps a falsy value rather than treating it as absent", () => {
    // `ai_agent_enabled: false` and `rank: 0` are meaningful updates; a filter
    // written with a truthiness check would silently swallow both.
    const { allowed } = pickUpdatableLeadColumns({ ai_agent_enabled: false, rank: 0 });
    expect(allowed).toEqual({ ai_agent_enabled: false, rank: 0 });
  });
});

describe("pickInsertableLeadColumns", () => {
  it("allows ownership columns, because creating a lead has to set its owner", () => {
    const lead = { name: "Padaria", user_id: "u-1", search_id: "s-1" };
    const { allowed, rejected } = pickInsertableLeadColumns(lead);
    expect(allowed).toEqual(lead);
    expect(rejected).toEqual([]);
  });

  it("names a column that is not part of public.leads", () => {
    const { allowed, rejected } = pickInsertableLeadColumns({
      name: "Padaria",
      scraped_at: "2026-08-17",
    });
    expect(allowed).toEqual({ name: "Padaria" });
    expect(rejected).toEqual(["scraped_at"]);
  });
});

describe("isAuthorizedForAction", () => {
  const ADMIN = { matchesAdmin: true, matchesOperational: false, matchesCalendar: false };
  const OPERATIONAL = { matchesAdmin: false, matchesOperational: true, matchesCalendar: false };
  const BOTH = { matchesAdmin: true, matchesOperational: true, matchesCalendar: false };
  const NEITHER = { matchesAdmin: false, matchesOperational: false, matchesCalendar: false };

  it("covers exactly the five actions that move money or access", () => {
    // Asserted as a literal list, not a count: adding a sixth action to the
    // set should be a deliberate edit here too.
    expect([...SENSITIVE_ACTIONS].sort()).toEqual([
      "add_credits",
      "deduct_credits",
      "deduct_credits_bulk",
      "renew_subscription",
      "set_user_access",
    ]);
  });

  it("refuses every sensitive action to the operational token", () => {
    for (const action of SENSITIVE_ACTIONS) {
      expect(isAuthorizedForAction(action, OPERATIONAL)).toBe(false);
    }
  });

  it("allows every sensitive action to the admin token", () => {
    for (const action of SENSITIVE_ACTIONS) {
      expect(isAuthorizedForAction(action, ADMIN)).toBe(true);
      expect(isAuthorizedForAction(action, BOTH)).toBe(true);
    }
  });

  it("still allows ordinary actions to the operational token", () => {
    // The other direction. A guard that denied everything would pass the
    // test above and break every workflow.
    for (const action of ["insert_leads", "query_leads", "get_user_context", "update_lead"]) {
      expect(isAuthorizedForAction(action, OPERATIONAL)).toBe(true);
    }
  });

  it("refuses anything when neither token matched", () => {
    expect(isAuthorizedForAction("query_leads", NEITHER)).toBe(false);
    expect(isAuthorizedForAction("add_credits", NEITHER)).toBe(false);
  });

  it("treats a non-string action as non-sensitive, leaving it to the 400", () => {
    expect(isAuthorizedForAction(undefined, OPERATIONAL)).toBe(true);
    expect(isAuthorizedForAction({ toString: () => "add_credits" }, OPERATIONAL)).toBe(true);
  });
});

describe("the deployed function still routes through the guards", () => {
  // The unit tests above prove the guards behave. They cannot prove index.ts
  // calls them -- someone could restore the raw spread and leave every test
  // green, which is exactly how the class reopened last time. Checking the
  // source is coarse, but it is the only thing that fails when the call site
  // regresses, and running the real function needs Deno, which CI's Vitest job
  // does not have.
  const proxySource = readFileSync(
    resolve(__dirname, "../../supabase/functions/n8n-proxy/handler.ts"),
    "utf8",
  );
  const pollSource = readFileSync(
    resolve(__dirname, "../../supabase/functions/send-queue-poll/handler.ts"),
    "utf8",
  );

  it("filters update_lead through the allow-list", () => {
    expect(proxySource).toContain("pickUpdatableLeadColumns");
    expect(proxySource).not.toContain(".update({ ...updates");
  });

  it("filters insert_leads through the allow-list", () => {
    expect(proxySource).toContain("pickInsertableLeadColumns");
  });

  it("compares both shared-token secrets in constant time", () => {
    expect(proxySource).toContain("timingSafeEqualStr");
    expect(pollSource).toContain("timingSafeEqualStr");
    // The `!==` header comparison this replaced.
    expect(pollSource).not.toContain("`Bearer ${expectedToken}`");
  });

  it("denies sensitive actions instead of only logging them", () => {
    // The guard spent months as a console.warn that fell through to the
    // switch. Its replacement has to actually return.
    expect(proxySource).toContain("isAuthorizedForAction");
    expect(proxySource).toContain("status: 403");
    expect(proxySource).not.toContain("sensitive_action_via_operational_token");
  });

  it("has exactly one implementation of the constant-time comparison", () => {
    // Two copies is how send-queue-poll ended up with `!==` while n8n-proxy
    // was already comparing in constant time.
    for (const source of [proxySource, pollSource]) {
      expect(source).not.toContain("function timingSafeEqualStr");
    }
  });
});

describe("get_calendar_access_token (SEC-007 / SEC-008)", () => {
  // The action exists so the Google refresh token stops travelling. Two places
  // held it: `get_user_context` returned it on every call, and the Agendamento
  // workflow kept the Google *client secret* in plaintext in order to redeem
  // it. Moving the exchange into the function removes both.
  const source = readFileSync(
    resolve(__dirname, "../../supabase/functions/n8n-proxy/handler.ts"),
    "utf8",
  );
  // Comments are stripped before any assertion below, the same way the SEC-007
  // block does it and for the same reason: the case body now explains why a
  // non-2xx from Google stopped becoming a null access token, and the sentence
  // saying so contains the very string this file counts. A gate that matches
  // prose goes red when someone documents the fix instead of when someone
  // undoes it.
  const NEWLINE = String.fromCharCode(10);
  const stripped = source
    .split(NEWLINE)
    .filter((line) => !line.trim().startsWith("//"))
    .join(NEWLINE);
  const CASE = stripped.slice(stripped.indexOf('case "get_calendar_access_token"'));
  const BODY = CASE.slice(0, CASE.indexOf(NEWLINE + "      case "));

  it("has its own credential tier rather than joining the sensitive one", () => {
    // Marking it sensitive would force `N8N_ADMIN_SHARED_TOKEN` -- which can
    // grant credits and open accounts -- into the SDR agent workflows. That
    // trades one exposure for a strictly worse one, so it gets a tier of its
    // own instead.
    expect(SENSITIVE_ACTIONS.has("get_calendar_access_token")).toBe(false);
    expect(CALENDAR_ACTIONS.has("get_calendar_access_token")).toBe(true);
    expect(
      isAuthorizedForAction("get_calendar_access_token", {
        matchesAdmin: false,
        matchesOperational: false,
        matchesCalendar: true,
      }),
    ).toBe(true);
  });

  it("is on the telemetry allow-list, so it cannot fail invisibly", () => {
    // An action missing here is recorded as `unknown`, which is how
    // `deduct_credits` failed 24 times without surfacing (OPS-002).
    expect(N8N_ACTIONS.has("get_calendar_access_token")).toBe(true);
  });

  it("exchanges the refresh token itself rather than returning it", () => {
    expect(BODY).toContain("oauth2.googleapis.com/token");
    expect(BODY).toContain("grant_type: \"refresh_token\"");
    expect(BODY).toContain("access_token: googleToken.access_token");

    // The refresh token may appear in the request *to Google* -- that is the
    // exchange. What must never happen is it appearing in `result`, which is
    // what gets serialised back to the caller. Assert on the assignments, not
    // on the whole case body: an earlier version of this test banned the
    // string outright and failed on the exchange itself.
    const assignments = BODY.match(/result = \{[\s\S]*?\};/g) ?? [];
    expect(assignments.length).toBe(3);
    for (const assignment of assignments) {
      expect(assignment).not.toContain("refresh_token");
    }
  });

  it("never logs the Google response, which carries the access token", () => {
    // `googleTokenRes.status` is fine and is deliberately logged; the parsed
    // body (`googleToken`) and either token string are not.
    const logs = BODY.match(/console\.(log|warn|error)\([\s\S]*?\)/g) ?? [];
    expect(logs.length).toBeGreaterThan(0);
    for (const line of logs) {
      expect(line).not.toContain("googleToken.");
      expect(line).not.toContain("access_token");
      expect(line).not.toContain("refresh_token");
    }
  });

  it("returns a null token instead of failing when there is no calendar", () => {
    // Both the never-connected and the revoked-access cases resolve to null.
    // The workflow branches on that to tell the owner to reconnect; throwing
    // would turn a normal state into an error the lead sees.
    const nulls = BODY.match(/access_token: null/g) ?? [];
    expect(nulls.length).toBe(2);
  });
});

describe("SEC-007: no HTTP path returns a Google refresh token", () => {
  // The class, not the instance. `get_user_context` was the measured leak --
  // 1,634 responses between 2026-08-15 and 2026-08-18 -- but `get_calendar_token`
  // was a second door to the same credential, admin-gated and unused. Closing
  // only the first would have left the class half shut, so this asserts across
  // every action the function serves, not just the one that was reported.
  const source = readFileSync(
    resolve(__dirname, "../../supabase/functions/n8n-proxy/handler.ts"),
    "utf8",
  );
  const NEXT_CASE = "      case ";

  // Comments are stripped before asserting. This file's own explanations name
  // `refresh_token` and `user_google_tokens` -- an earlier draft of these gates
  // failed on its own prose, which would have been a test that goes red when
  // someone documents the fix rather than when someone undoes it.
  const NL = String.fromCharCode(10);
  const code = source
    .split(NL)
    .filter((line) => !line.trim().startsWith("//"))
    .join(NL);

  function caseBody(action: string): string {
    const block = code.slice(code.indexOf(`case "${action}"`));
    const end = block.indexOf(NEXT_CASE, 1);
    return end === -1 ? block : block.slice(0, end);
  }

  it("get_user_context returns only the calendar email", () => {
    const body = caseBody("get_user_context");
    expect(body).toContain("google_calendar: {");
    expect(body).toContain("email: ctxData.google_calendar_email");
    expect(body).not.toContain("refresh_token");
    // The query that fetched it is gone too, not merely the field.
    expect(body).not.toContain("user_google_tokens");
  });

  it("no action other than the exchange itself reads user_google_tokens", () => {
    const cases = code.split(NEXT_CASE + '"').slice(1);
    const readers = cases
      .filter((block) => block.includes("user_google_tokens"))
      .map((block) => block.slice(0, block.indexOf('"')));
    expect(readers).toEqual(["get_calendar_access_token"]);
  });

  it("the one action that reaches the token exchanges it rather than returning it", () => {
    const body = caseBody("get_calendar_access_token");
    const assignments = body.match(/result = {[\s\S]*?};/g) ?? [];
    expect(assignments.length).toBeGreaterThan(0);
    for (const assignment of assignments) {
      expect(assignment).not.toContain("refresh_token");
    }
  });
});

describe("get_calendar_access_token: a failure to reach Google is not a disconnected calendar", () => {
  // The behavioral shape of this property -- not_connected vs. revoked vs. a
  // genuine Google failure, and which status code each produces -- is
  // exercised against the real handler in
  // supabase/functions/_tests/n8n-proxy.get-calendar-access-token.test.ts,
  // which drives it through a routed fetch stub rather than reading source as
  // text. What that suite cannot see is log output, since it only inspects
  // the Response -- that stays a source check.
  const NEWLINE = String.fromCharCode(10);
  const code = readFileSync(
    resolve(__dirname, "../../supabase/functions/n8n-proxy/handler.ts"),
    "utf8",
  )
    .split(NEWLINE)
    .filter((line) => !line.trim().startsWith("//"))
    .join(NEWLINE);
  const CASE = code.slice(code.indexOf('case "get_calendar_access_token"'));
  const BODY = CASE.slice(0, CASE.indexOf(NEWLINE + "      case "));

  it("still refuses to log anything that carries a token", () => {
    // The new log line adds Google's short `error` enum. That is not a secret;
    // the response body is, and it must stay out.
    const logs = BODY.match(/console\.(log|warn|error)\([\s\S]*?\)/g) ?? [];
    expect(logs.length).toBeGreaterThan(0);
    for (const line of logs) {
      expect(line).not.toContain("googleToken.");
      expect(line).not.toContain("access_token");
      expect(line).not.toContain("refresh_token");
    }
  });
});

describe("a privileged action cannot complete without a trace", () => {
  // The behavioral property -- write-before-act, refuse on a failed insert,
  // seal to succeeded/failed rather than leaving the row pending -- is
  // exercised against the real handlers in
  // supabase/functions/_tests/admin-update-password.audit.test.ts and
  // admin-impersonate.audit.test.ts. What stays here is the one thing those
  // tests cannot see: whether the migration those two endpoints depend on
  // actually shipped the column, in the right order.

  it("has a migration that adds the column both endpoints now write", () => {
    // The CI deploy publishes edge functions and does NOT apply migrations.
    // If this column is missing in production when the functions land, every
    // admin password reset and every impersonation stops working.
    const migration = readFileSync(
      resolve(__dirname, "../../supabase/migrations/20260820120000_admin_audit_outcome.sql"),
      "utf8",
    );
    for (const table of ["admin_password_reset_logs", "admin_impersonation_logs"]) {
      expect(migration).toContain(`ALTER TABLE public.${table}`);
    }
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS outcome text;");
    // Backfill before the default: the 38 existing impersonation rows are
    // consummated successes, and a bare DEFAULT 'pending' would relabel them
    // as attempts that never finished.
    expect(migration.indexOf("SET outcome = 'succeeded'")).toBeLessThan(
      migration.indexOf("SET DEFAULT 'pending'"),
    );
  });
});

describe("the safety deadline actually cancels something", () => {
  // A `setTimeout` callback that throws runs in its own macrotask, outside
  // the promise the handler returns: nothing downstream can catch it, and no
  // in-flight fetch or query is cancelled by it. This checks for the absence
  // of that shape. The behavioral half -- a hung upstream genuinely producing
  // 504 FUNCTION_TIMEOUT -- is exercised against the real handler in
  // supabase/functions/_tests/n8n-proxy.deadline.test.ts.
  //
  // Comments are stripped first, for the same reason as the SEC-007 block
  // above: the file under test explains its own fix, and a gate that matched
  // prose would go red when someone documents it rather than when someone
  // undoes it.
  const NL = String.fromCharCode(10);
  const code = readFileSync(
    resolve(__dirname, "../../supabase/functions/n8n-proxy/handler.ts"),
    "utf8",
  )
    .split(NL)
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
    .join(NL);

  it("has no throw inside a setTimeout callback", () => {
    const callbacks = code.match(/setTimeout\(\s*\(\)\s*=>\s*\{[\s\S]*?\}/g) ?? [];
    for (const callback of callbacks) expect(callback).not.toContain("throw");
  });

  it("aborts a controller on the deadline", () => {
    expect(code).toMatch(/setTimeout\(\(\)\s*=>\s*deadline\.abort\(\)/);
  });

  it("passes the signal to every outbound fetch", () => {
    // Not "to a fetch" -- to all of them. A signal wired into one call and not
    // the other is the same defect wearing the right vocabulary.
    const calls = code.match(/await fetch\([\s\S]*?\n\s*\}\);/g) ?? [];
    expect(calls.length).toBeGreaterThan(1);
    for (const call of calls) expect(call).toContain("signal: deadline.signal");
  });

  it("answers 504 when the deadline fired, not the generic 500", () => {
    expect(code).toContain("deadline.signal.aborted");
    expect(code).toMatch(/status: timedOut \? 504 : 500/);
  });
});

describe("the calendar capability travels in exactly one credential", () => {
  const CALENDAR = { matchesAdmin: false, matchesOperational: false, matchesCalendar: true };
  const OPERATIONAL = { matchesAdmin: false, matchesOperational: true, matchesCalendar: false };
  const ADMIN = { matchesAdmin: true, matchesOperational: false, matchesCalendar: false };
  const NEITHER = { matchesAdmin: false, matchesOperational: false, matchesCalendar: false };
  const ACTION = "get_calendar_access_token";

  it("accepts the calendar token", () => {
    expect(isAuthorizedForAction(ACTION, CALENDAR)).toBe(true);
  });

  it("refuses the admin token, which is not a more-privileged shortcut here", () => {
    // Everywhere else the admin token is accepted because it is strictly more
    // privileged. Not here. The property being defended is "exactly one
    // credential reaches a customer's calendar" -- a second accepted token is
    // a second door.
    expect(isAuthorizedForAction(ACTION, ADMIN)).toBe(false);
  });

  it("refuses the operational token", () => {
    // The token pasted into ~30 n8n `Set` nodes must not be able to renew a
    // Google access token for a customer's calendar.
    expect(isAuthorizedForAction(ACTION, OPERATIONAL)).toBe(false);
  });

  it("refuses when nothing matched", () => {
    expect(isAuthorizedForAction(ACTION, NEITHER)).toBe(false);
  });

  it("reads its own secret in the function, not just in the shared module", () => {
    const source = readFileSync(
      resolve(__dirname, "../../supabase/functions/n8n-proxy/handler.ts"),
      "utf8",
    );
    expect(source).toContain('Deno.env.get("N8N_CALENDAR_TOKEN")');
    // Constant-time, like the other two. A plain !== leaks how many leading
    // bytes matched.
    expect(source).toMatch(/matchesCalendar = calendarToken\.length > 0 && timingSafeEqualStr/);
    // And it must reach the authorization call, or the tier is decorative.
    expect(source).toContain("matchesAdmin, matchesOperational, matchesCalendar");
  });
});
