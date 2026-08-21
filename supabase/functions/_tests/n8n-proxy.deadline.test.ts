// The safety deadline used to be `setTimeout(() => { throw }, 55000)`, a
// throw in a macrotask the handler's own try/catch could never see -- it did
// not cancel anything and never produced a response the caller could act on.
// The replacement is an AbortController whose signal reaches every outbound
// fetch, and a catch that turns the abort into a 504 instead of the generic
// 500 a caller cannot tell apart from an ordinary bug.
//
// This test drives that behavior directly: a fetch stub that never resolves,
// against a handler whose real deadline is 55s, would make the suite hang.
// So it monkey-patches globalThis.setTimeout for the duration of one call to
// fire immediately, which triggers the same deadline.abort() the handler
// would reach after 55 real seconds -- same code path, without the wait.
import { assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { handler } from "../n8n-proxy/handler.ts";

const CALENDAR_TOKEN = "test-calendar-token";

Deno.test("the deadline firing answers 504, not the generic 500", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;

  // Fire every setTimeout immediately -- this includes the handler's own
  // `setTimeout(() => deadline.abort(), 55000)`, so the deadline trips before
  // the stubbed fetch below is ever awaited.
  globalThis.setTimeout = ((fn: (...args: unknown[]) => void, _ms?: number, ...args: unknown[]) =>
    originalSetTimeout(fn, 0, ...args)) as typeof setTimeout;

  // The two PostgREST lookups this action makes before it ever reaches
  // Google answer immediately -- they carry no abort signal (only the
  // handler's own explicit fetch calls do), so a stub that hangs
  // unconditionally would hang the test itself, not exercise the deadline.
  // Only the Google token exchange -- the one call the source passes
  // `signal: deadline.signal` to -- hangs until aborted, mirroring a slow
  // upstream.
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes("oauth2.googleapis.com/token")) {
      return Promise.resolve(
        new Response(JSON.stringify([{ google_calendar_email: null, refresh_token: "stored-refresh-token" }]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });
  }) as typeof fetch;

  try {
    const req = new Request("https://example.com/", {
      method: "POST",
      headers: { Authorization: `Bearer ${CALENDAR_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "get_calendar_access_token",
        user_id: "11111111-1111-4111-8111-111111111111",
      }),
    });
    const res = await handler(req);
    const body = await res.json();
    assertEquals(res.status, 504);
    assertEquals(body.error_code, "FUNCTION_TIMEOUT");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});
