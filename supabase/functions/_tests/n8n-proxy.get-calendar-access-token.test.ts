// get_calendar_access_token is the one action that exchanges a stored Google
// refresh token for a short-lived access token, so the refresh token itself
// never leaves this function (SEC-007). The property this file exercises:
// "no calendar connected" and "Google is unreachable" are different states,
// and the caller must be able to tell them apart -- a 429/500 from Google
// must never be reported as "the customer isn't connected".
//
// Each test drives the real handler with a routed fetch stub: profiles and
// user_google_tokens answer as PostgREST would, oauth2.googleapis.com/token
// answers as Google would for that scenario. Nothing here mirrors the
// handler's logic -- it only controls what the network returns.
import { assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { handler } from "../n8n-proxy/handler.ts";

const CALENDAR_TOKEN = "test-calendar-token";
const USER_ID = "11111111-1111-4111-8111-111111111111";

function route(handlers: { profiles?: () => Response; tokens?: () => Response; google?: () => Response }): typeof fetch {
  return ((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("oauth2.googleapis.com/token")) {
      return Promise.resolve((handlers.google ?? genericOk)());
    }
    if (url.includes("/rest/v1/user_google_tokens")) {
      return Promise.resolve((handlers.tokens ?? genericOk)());
    }
    if (url.includes("/rest/v1/profiles")) {
      return Promise.resolve((handlers.profiles ?? genericOk)());
    }
    // Telemetry RPC and anything else: a generic success is enough, this
    // file isn't testing telemetry.
    return Promise.resolve(genericOk());
  }) as typeof fetch;
}

function genericOk(): Response {
  return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
}

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function callCalendarAction(): Promise<{ status: number; body: Record<string, unknown> }> {
  const req = new Request("https://example.com/", {
    method: "POST",
    headers: { Authorization: `Bearer ${CALENDAR_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "get_calendar_access_token", user_id: USER_ID }),
  });
  const res = await handler(req);
  const body = await res.json();
  return { status: res.status, body };
}

async function withFetch(stub: typeof fetch, run: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = stub;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}

Deno.test("no row in user_google_tokens: reason is not_connected, not an error", async () => {
  await withFetch(
    route({
      profiles: () => jsonRes([{ google_calendar_email: null }]),
      tokens: () => jsonRes([]), // .maybeSingle() on an empty array -> null
    }),
    async () => {
      const { status, body } = await callCalendarAction();
      assertEquals(status, 200);
      assertEquals(body.access_token, null);
      assertEquals(body.reason, "not_connected");
    },
  );
});

Deno.test("Google answers invalid_grant: reason is revoked, not an error", async () => {
  await withFetch(
    route({
      profiles: () => jsonRes([{ google_calendar_email: "owner@example.com" }]),
      tokens: () => jsonRes([{ refresh_token: "stored-refresh-token" }]),
      google: () => jsonRes({ error: "invalid_grant" }, 400),
    }),
    async () => {
      const { status, body } = await callCalendarAction();
      assertEquals(status, 200);
      assertEquals(body.access_token, null);
      assertEquals(body.reason, "revoked");
      assertEquals(body.email, "owner@example.com");
    },
  );
});

Deno.test("Google answers 429: this is a failure, never a null token", async () => {
  await withFetch(
    route({
      profiles: () => jsonRes([{ google_calendar_email: "owner@example.com" }]),
      tokens: () => jsonRes([{ refresh_token: "stored-refresh-token" }]),
      google: () => jsonRes({ error: "rate_limited" }, 429),
    }),
    async () => {
      const { status, body } = await callCalendarAction();
      // A null token with a 200 here would read as "customer isn't
      // connected" to every account whenever Google rate-limited or had an
      // outage -- not a real disconnection state.
      assertEquals(status, 500);
      assertEquals(body.access_token, undefined);
    },
  );
});

Deno.test("Google answers 500 with a misconfigured-credential error: also a failure, not a null token", async () => {
  await withFetch(
    route({
      profiles: () => jsonRes([{ google_calendar_email: "owner@example.com" }]),
      tokens: () => jsonRes([{ refresh_token: "stored-refresh-token" }]),
      google: () => jsonRes({ error: "invalid_client" }, 500),
    }),
    async () => {
      const { status, body } = await callCalendarAction();
      assertEquals(status, 500);
      assertEquals(body.access_token, undefined);
    },
  );
});

Deno.test("Google answers 200: the access token is returned, and the refresh token never appears in the response", async () => {
  await withFetch(
    route({
      profiles: () => jsonRes([{ google_calendar_email: "owner@example.com" }]),
      tokens: () => jsonRes([{ refresh_token: "SECRET-REFRESH-TOKEN" }]),
      google: () => jsonRes({ access_token: "short-lived-access-token", expires_in: 3599 }),
    }),
    async () => {
      const { status, body } = await callCalendarAction();
      assertEquals(status, 200);
      assertEquals(body.access_token, "short-lived-access-token");
      assertEquals(body.expires_in, 3599);
      assertEquals(body.email, "owner@example.com");
      assertEquals(JSON.stringify(body).includes("SECRET-REFRESH-TOKEN"), false);
    },
  );
});

Deno.test("a failed read of profiles is a thrown error, not a silently missing email", async () => {
  await withFetch(
    route({
      // PostgREST error shape: non-2xx with an error body. supabase-js
      // surfaces this as `error`, which the handler re-throws.
      profiles: () => jsonRes({ message: "connection reset", code: "08006" }, 500),
      tokens: () => jsonRes([{ refresh_token: "stored-refresh-token" }]),
    }),
    async () => {
      const { status } = await callCalendarAction();
      assertEquals(status, 500);
    },
  );
});
