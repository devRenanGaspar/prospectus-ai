// Which credential each `n8n-proxy` action requires.
//
// Authorization is not binary: an action can require the operational token
// (`N8N_SHARED_TOKEN`, spread across ~30 n8n workflows), the admin token
// (`N8N_ADMIN_SHARED_TOKEN`, moves money or changes account access), or the
// calendar token (`N8N_CALENDAR_TOKEN`, exchanges a stored Google refresh
// token for a short-lived access token).
//
// The calendar tier is not folded into either existing one. Sensitive would
// force the admin token -- which can grant credits and open accounts -- into
// the SDR agent workflows, trading one exposure for a strictly worse one.
// Operational would mean a leak of the token pasted into ~30 `Set` nodes
// could renew a Google access token for any connected customer indefinitely.
// The property this tier defends is "exactly one credential reaches a
// customer's calendar" -- so it accepts neither of the other two, including
// the admin one, which is accepted everywhere else because it is strictly
// more privileged. Not here: a second accepted credential is a second door.
//
// Plain TypeScript, no Deno globals, so `src/test/` exercises the same module
// the deployed function imports rather than a copy of it.

export const SENSITIVE_ACTIONS: ReadonlySet<string> = new Set([
  "add_credits",
  "deduct_credits",
  "deduct_credits_bulk",
  "renew_subscription",
  "set_user_access",
]);

/** Actions gated on `N8N_CALENDAR_TOKEN`, and only that token. */
export const CALENDAR_ACTIONS: ReadonlySet<string> = new Set([
  "get_calendar_access_token",
]);

export function isSensitiveAction(action: unknown): boolean {
  return typeof action === "string" && SENSITIVE_ACTIONS.has(action);
}

export function isCalendarAction(action: unknown): boolean {
  return typeof action === "string" && CALENDAR_ACTIONS.has(action);
}

/** Which shared secrets the caller presented. Authentication happens first. */
export type PresentedTokens = {
  matchesAdmin: boolean;
  matchesOperational: boolean;
  matchesCalendar: boolean;
};

/**
 * Whether a request may run `action`.
 *
 * A request matching no token at all is already a 401 before this runs.
 *
 * The admin token is accepted for every non-calendar action, not only the
 * sensitive ones: it is strictly the more privileged credential, and requiring
 * workflows to carry both would put the operational token in more places, not
 * fewer.
 *
 * The calendar tier is the exception, and deliberately so: it accepts neither
 * the operational token **nor** the admin one. The point is not "more
 * privileged wins" but "this capability travels in exactly one credential",
 * so a leak of any other token cannot reach a customer's calendar.
 */
export function isAuthorizedForAction(action: unknown, tokens: PresentedTokens): boolean {
  if (isCalendarAction(action)) return tokens.matchesCalendar;
  if (!tokens.matchesAdmin && !tokens.matchesOperational) return false;
  if (isSensitiveAction(action)) return tokens.matchesAdmin;
  return true;
}
