/**
 * The Settings export claims to be "todos os seus dados", and `Privacy.tsx`
 * §8 lists LGPD portability as a right exercised through that button -- so
 * the export has to actually carry every table `user-data-tables.ts`
 * declares, and it has to do so completely.
 *
 * "Completely" is the part a table-count check alone would miss: PostgREST
 * returns at most 1,000 rows per request, and several of these tables
 * routinely exceed that per account. An export built without `range()` would
 * look complete -- the request succeeds, a file downloads -- while silently
 * truncating. The pagination tests below are what actually close that gap; a
 * test that only counted tables would pass over a still-truncating export.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  fetchAllRows,
  PAGE_SIZE,
  PROFILE_COLUMNS,
  USER_DATA_TABLES,
} from "@/lib/user-data-tables";

/** A fake table of `total` rows that honours `range()` the way PostgREST does. */
function fakeTable(total: number) {
  const calls: Array<[number, number]> = [];
  const run = (from: number, to: number) => {
    calls.push([from, to]);
    const size = Math.min(to - from + 1, PAGE_SIZE);
    const rows = [];
    for (let i = from; i < Math.min(from + size, total); i += 1) rows.push({ id: i });
    return Promise.resolve({ data: rows, error: null });
  };
  return { run, calls };
}

describe("the export reads past PostgREST's 1,000-row ceiling", () => {
  it("returns every row of a table larger than one page", async () => {
    // 4,546 is not a round number on purpose: it is the real message count of
    // the largest account measured in production, and the last page being
    // partial is what tells the loop to stop.
    const table = fakeTable(4546);
    const rows = await fetchAllRows(table.run, "messages");
    expect(rows).toHaveLength(4546);
    expect(new Set(rows.map((r) => (r as { id: number }).id)).size).toBe(4546);
  });

  it("makes more than one request for such a table", async () => {
    // Guards the guard. If fetchAllRows ever stopped paginating, the assertion
    // above could still pass against a fake that ignored `range()`.
    const table = fakeTable(4546);
    await fetchAllRows(table.run, "messages");
    expect(table.calls.length).toBe(5);
    expect(table.calls[0]).toEqual([0, 999]);
    expect(table.calls[4]).toEqual([4000, 4999]);
  });

  it("stops after one request when the table fits in a page", async () => {
    const table = fakeTable(12);
    expect(await fetchAllRows(table.run, "leads")).toHaveLength(12);
    expect(table.calls.length).toBe(1);
  });

  it("asks once more when a page comes back exactly full", async () => {
    // A table whose size is an exact multiple of the page size is
    // indistinguishable from one with more rows until the next request comes
    // back empty. One wasted round trip beats guessing where the data ends.
    const table = fakeTable(PAGE_SIZE);
    expect(await fetchAllRows(table.run, "leads")).toHaveLength(PAGE_SIZE);
    expect(table.calls.length).toBe(2);
  });

  it("throws on a query error instead of writing null into the file", async () => {
    // The old handler destructured `{ data }` and dropped `error`, so a failed
    // read became `null` in the JSON under a success toast: the user
    // downloaded a file that said they had no leads.
    const failing = () => Promise.resolve({ data: null, error: { message: "permission denied" } });
    await expect(fetchAllRows(failing, "leads")).rejects.toThrow(/leads: permission denied/);
  });

  it("stops at the failing table rather than continuing past it", async () => {
    let pages = 0;
    const failOnSecondPage = (from: number) => {
      pages += 1;
      if (from === 0) {
        return Promise.resolve({ data: Array.from({ length: PAGE_SIZE }, (_, i) => ({ id: i })), error: null });
      }
      return Promise.resolve({ data: null, error: { message: "timeout" } });
    };
    await expect(fetchAllRows(failOnSecondPage, "messages")).rejects.toThrow(/messages: timeout/);
    expect(pages).toBe(2);
  });
});

describe("what the export covers", () => {
  const SETTINGS = readFileSync(resolve(__dirname, "../pages/Settings.tsx"), "utf8");

  it("carries the six tables the three-table version omitted", () => {
    const covered = USER_DATA_TABLES.map((t) => t.table).sort();
    expect(covered).toEqual([
      "copy_requests",
      "lead_comments",
      "lead_searches",
      "leads",
      "messages",
      "send_requests",
      "subscriptions",
      "usage_logs",
    ]);
  });

  it("never selects * from messages, which would carry the lead's words", () => {
    const messages = USER_DATA_TABLES.find((t) => t.table === "messages");
    expect(messages?.columns).not.toContain("*");
    expect(messages?.columns).not.toContain("content");
  });

  it("selects only columns that exist on messages", () => {
    // An earlier draft of this list named a `status` column. It does not
    // exist -- and because the export now fails loudly on any query error,
    // that single wrong column would have broken the export for every user
    // rather than producing a slightly wrong file. Checked against the
    // generated types, which are the same source the client compiles against.
    const types = readFileSync(resolve(__dirname, "../integrations/supabase/types.ts"), "utf8");
    const block = types.slice(types.indexOf("      messages: {"));
    const row = block.slice(block.indexOf("Row: {"), block.indexOf("Insert: {"));
    const existing = [...row.matchAll(/^\s{10}([a-z_]+):/gm)].map((m) => m[1]);
    expect(existing.length).toBeGreaterThan(3);

    const selected = USER_DATA_TABLES.find((t) => t.table === "messages")!.columns
      .split(",")
      .map((c) => c.trim());
    for (const column of selected) expect(existing).toContain(column);
  });

  it("selects only columns that exist on profiles", () => {
    const types = readFileSync(resolve(__dirname, "../integrations/supabase/types.ts"), "utf8");
    const block = types.slice(types.indexOf("      profiles: {"));
    const row = block.slice(block.indexOf("Row: {"), block.indexOf("Insert: {"));
    const existing = [...row.matchAll(/^\s{10}([a-z_]+):/gm)].map((m) => m[1]);
    for (const column of PROFILE_COLUMNS.split(",").map((c) => c.trim())) {
      expect(existing).toContain(column);
    }
  });

  it("scopes messages and lead_comments through RLS, not a column they lack", () => {
    // Both are keyed by lead_id and have no user_id. Their policy is
    // `lead_id IN (SELECT id FROM leads WHERE user_id = auth.uid())`, so an
    // .eq("user_id", ...) would be a 400, not a narrower result.
    for (const name of ["messages", "lead_comments"]) {
      expect(USER_DATA_TABLES.find((t) => t.table === name)?.scope).toBe("rls");
    }
  });

  it("orders every table, so pages cannot repeat or skip rows", () => {
    for (const spec of USER_DATA_TABLES) expect(spec.orderBy).toBeTruthy();
  });

  it("no longer offers 'todos os seus dados' on the export card", () => {
    // The C1 gate, narrow on purpose: one named claim pinned to the code that
    // makes it true. The export is not everything -- message text is excluded
    // by decision -- so its label must not say it is.
    //
    // Scoped to the export card. The deletion card two blocks below says
    // "exclusão permanente de todos os seus dados" and is correct: deletion
    // really does remove everything. Asserting over the whole file would have
    // failed on a true sentence, which is how a gate teaches people to delete
    // it.
    const card = SETTINGS.slice(SETTINGS.indexOf("Exportar meus dados"));
    const label = card.slice(0, card.indexOf("</Button>"));
    expect(label).toContain("Exportar");
    expect(label).not.toContain("todos os seus dados");
  });

  it("says in the privacy policy what the export leaves out", () => {
    // The policy names the exclusion (messages carry metadata only, not
    // text), so widening the export to carry message content -- or
    // narrowing it further -- without touching §8 breaks this test instead
    // of quietly making the policy wrong.
    const POLICY = readFileSync(resolve(__dirname, "../pages/Privacy.tsx"), "utf8");
    expect(POLICY).toContain("texto");
    expect(POLICY).toContain("não vai no arquivo");
    const messages = USER_DATA_TABLES.find((t) => t.table === "messages");
    expect(messages?.columns).not.toContain("content");
  });

  it("reaches the export through the tracked list rather than an inline copy", () => {
    // The list has to have exactly one home. A second copy inside Settings.tsx
    // is how the runbook and the export drifted apart in the first place.
    expect(SETTINGS).toContain("USER_DATA_TABLES");
    expect(SETTINGS).toContain("fetchAllRows");
  });
});
