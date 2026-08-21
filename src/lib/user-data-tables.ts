/**
 * What "todos os seus dados" means, in one tracked place.
 *
 * The Settings export button and `Privacy.tsx` §8's LGPD portability claim
 * both need the same answer to "which tables count as the user's data" --
 * `profiles`, `leads`, `usage_logs`, `messages` (metadata only, see below),
 * `lead_comments`, `lead_searches`, `copy_requests`, `send_requests` and
 * `subscriptions`. Keeping the list in one module, imported by the export,
 * the privacy copy and the test, is what keeps them from drifting apart.
 *
 * The account-deletion runbook enumerates the same tables independently,
 * because it lives at
 * `docs/operations/prospectus-account-deletion-runbook.md`, which
 * `.gitignore` excludes for carrying tenant identifiers -- a CI test cannot
 * read it in a clean checkout. The *list* itself is not sensitive, so it
 * lives here instead of only in the runbook.
 *
 * PAGE_SIZE exists because PostgREST caps a response at 1,000 rows, and
 * several of these tables regularly exceed that per account. Fetching a
 * single page and calling it complete is the failure mode this module is
 * built to prevent.
 */

export type ExportTable = {
  /** Table name, as PostgREST addresses it. */
  table: string;
  /**
   * Explicit column list, or `"*"`.
   *
   * `"*"` is used only where every column is the account holder's own record.
   * `messages` is the one exception in the other direction and is spelled out:
   * the owner's decision is that the export carries message *metadata* and not
   * the text. What a lead wrote is a third party's words, and LGPD
   * portability covers the data subject's data, not the other side of the
   * conversation.
   */
  columns: string;
  /**
   * How the rows are narrowed to this user.
   *
   * - `"user_id"` — an explicit `.eq("user_id", id)`.
   * - `"rls"` — no filter at all, because the row-level policy already scopes
   *   the table through `lead_id IN (SELECT id FROM leads WHERE user_id =
   *   auth.uid())`. `messages` and `lead_comments` have no `user_id` column,
   *   so filtering on one would fail outright.
   */
  scope: "user_id" | "rls";
  /** Ordering column. Pagination without a stable sort can repeat or skip rows. */
  orderBy: string;
};

/**
 * `id` orders every table because all nine have one, and because the
 * alternative -- a timestamp -- is not unique, which is exactly how a
 * paginated read starts dropping rows.
 */
export const USER_DATA_TABLES: ExportTable[] = [
  {
    table: "leads",
    columns: "*",
    scope: "user_id",
    orderBy: "id",
  },
  {
    table: "usage_logs",
    columns: "*",
    scope: "user_id",
    orderBy: "id",
  },
  {
    table: "lead_searches",
    columns: "*",
    scope: "user_id",
    orderBy: "id",
  },
  {
    table: "copy_requests",
    columns: "*",
    scope: "user_id",
    orderBy: "id",
  },
  {
    table: "send_requests",
    columns: "*",
    scope: "user_id",
    orderBy: "id",
  },
  {
    table: "subscriptions",
    columns: "*",
    scope: "user_id",
    orderBy: "id",
  },
  {
    table: "lead_comments",
    // Authored by the account holder about their own lead, so the text is
    // theirs and is included.
    columns: "*",
    scope: "rls",
    orderBy: "id",
  },
  {
    table: "messages",
    // Deliberately not "*": that would bring `content`, the message text.
    // These are the other five columns. The list is explicit rather than a
    // negation because PostgREST has no "everything except" -- and because an
    // explicit list makes the omission visible to a reader instead of implied.
    //
    // Verified against src/integrations/supabase/types.ts before writing: the
    // columns are exactly id, lead_id, sender, timestamp, external_message_id.
    // An earlier draft of this list included `status`, which does not exist --
    // and since the export now fails loudly on any query error, that one wrong
    // column would have broken the export for every user rather than
    // returning a slightly wrong file.
    columns: "id, lead_id, sender, timestamp, external_message_id",
    scope: "rls",
    orderBy: "id",
  },
];

/** PostgREST refuses to return more than this many rows in one response. */
export const PAGE_SIZE = 1000;

/**
 * The columns of `profiles` the export carries. Not part of the list above
 * because it is a single row fetched by primary key, with no pagination and
 * no `user_id` scope.
 */
export const PROFILE_COLUMNS =
  "id, full_name, email, role, credits_balance, plan_id, whatsapp_status, whatsapp_number, whatsapp_photo, agency_name, context_persona, context_icp, context_qualification, context_faq, google_calendar_email, google_calendar_connected_at, sdr_phone, sdr_availability, onboarding_completed, created_at";

type Page = { data: unknown[] | null; error: { message: string } | null };

/**
 * Reads every row of one table, following PostgREST's 1,000-row ceiling.
 *
 * Stops when a page comes back short. A page that comes back exactly full is
 * followed by another request, which may legitimately return zero rows -- one
 * wasted round trip in exchange for never guessing at the end of the data.
 *
 * Any error stops the whole export. The version this replaced destructured
 * `{ data }` and dropped `error`, so a failed query became `null` in the JSON
 * under a success toast: the user downloaded a file that said their leads
 * were empty.
 */
export async function fetchAllRows(
  // PromiseLike, not Promise: a supabase-js query builder is thenable but is
  // not a Promise, so the caller can hand this the builder directly instead of
  // wrapping every call site in an async arrow.
  runPage: (from: number, to: number) => PromiseLike<Page>,
  tableName: string,
): Promise<unknown[]> {
  const rows: unknown[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await runPage(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${tableName}: ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}
