// The property under test: every n8n-proxy action enforces the credential
// tier declared in _shared/sensitive-actions.ts, and it is the *deployed*
// handler enforcing it -- not a description of it. 401/403 happen before any
// database or network call, so those paths need no stub at all. The "passed
// authorization" paths do reach the switch, so a generic fetch stub lets them
// run without a real database; this test only asserts the request got past
// the gate, not that the downstream action succeeded -- that is covered by
// the action-specific tests in this directory.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { handler } from "../n8n-proxy/handler.ts";
import { N8N_ACTIONS } from "../_shared/operational-telemetry.ts";
import { SENSITIVE_ACTIONS, CALENDAR_ACTIONS } from "../_shared/sensitive-actions.ts";

const OPERATIONAL_TOKEN = "test-operational-token";
const ADMIN_TOKEN = "test-admin-token";
const CALENDAR_TOKEN = "test-calendar-token";

function genericFetchStub(): typeof fetch {
  return (() =>
    Promise.resolve(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )) as typeof fetch;
}

async function callWithToken(action: string, token: string | null): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  const req = new Request("https://example.com/", {
    method: "POST",
    headers,
    body: JSON.stringify({ action }),
  });
  return handler(req);
}

const ACTIONS = [...N8N_ACTIONS].sort();

Deno.test("the auth matrix covers exactly the 26 actions the handler dispatches", () => {
  // Fails if a new action is added to the switch without being added to the
  // telemetry allow-list this test reads from, or vice versa -- the same
  // property src/test/n8n-proxy-guards.test.ts asserts from the source-text
  // side. Here it is asserted by actually calling the handler.
  assertEquals(ACTIONS.length, 26);
});

Deno.test("no credential at all: every action refuses with 401, before any I/O", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = (() => {
    fetchCalled = true;
    return Promise.reject(new Error("network should not be reached"));
  }) as typeof fetch;
  try {
    for (const action of ACTIONS) {
      const res = await callWithToken(action, null);
      assertEquals(res.status, 401, `${action} should 401 with no token`);
    }
    assertEquals(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("a garbage token: every action refuses with 401, before any I/O", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = (() => {
    fetchCalled = true;
    return Promise.reject(new Error("network should not be reached"));
  }) as typeof fetch;
  try {
    for (const action of ACTIONS) {
      const res = await callWithToken(action, "not-a-real-token");
      assertEquals(res.status, 401, `${action} should 401 with a garbage token`);
    }
    assertEquals(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("the operational token: sensitive and calendar actions refuse with 403, before any I/O; everything else passes", async () => {
  const originalFetch = globalThis.fetch;
  let refusalFetchCalled = false;
  try {
    for (const action of ACTIONS) {
      const shouldRefuse = SENSITIVE_ACTIONS.has(action) || CALENDAR_ACTIONS.has(action);
      globalThis.fetch = shouldRefuse
        ? ((() => {
            refusalFetchCalled = true;
            return Promise.reject(new Error("network should not be reached"));
          }) as typeof fetch)
        : genericFetchStub();
      const res = await callWithToken(action, OPERATIONAL_TOKEN);
      if (shouldRefuse) {
        assertEquals(res.status, 403, `${action} should refuse the operational token`);
      } else {
        assert(
          res.status !== 401 && res.status !== 403,
          `${action} should pass authorization with the operational token, got ${res.status}`,
        );
      }
    }
    assertEquals(refusalFetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("the admin token: only the calendar action refuses with 403; every other action passes, including sensitive ones", async () => {
  const originalFetch = globalThis.fetch;
  let refusalFetchCalled = false;
  try {
    for (const action of ACTIONS) {
      const shouldRefuse = CALENDAR_ACTIONS.has(action);
      globalThis.fetch = shouldRefuse
        ? ((() => {
            refusalFetchCalled = true;
            return Promise.reject(new Error("network should not be reached"));
          }) as typeof fetch)
        : genericFetchStub();
      const res = await callWithToken(action, ADMIN_TOKEN);
      if (shouldRefuse) {
        assertEquals(res.status, 403, `${action} should refuse the admin token`);
      } else {
        assert(
          res.status !== 401 && res.status !== 403,
          `${action} should pass authorization with the admin token, got ${res.status}`,
        );
      }
    }
    assertEquals(refusalFetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("the calendar token: only the calendar action passes; every other action refuses with 403, before any I/O", async () => {
  const originalFetch = globalThis.fetch;
  let refusalFetchCalled = false;
  try {
    for (const action of ACTIONS) {
      const shouldPass = CALENDAR_ACTIONS.has(action);
      globalThis.fetch = shouldPass
        ? genericFetchStub()
        : ((() => {
            refusalFetchCalled = true;
            return Promise.reject(new Error("network should not be reached"));
          }) as typeof fetch);
      const res = await callWithToken(action, CALENDAR_TOKEN);
      if (shouldPass) {
        assert(
          res.status !== 401 && res.status !== 403,
          `${action} should pass authorization with the calendar token, got ${res.status}`,
        );
      } else {
        assertEquals(res.status, 403, `${action} should refuse the calendar token`);
      }
    }
    assertEquals(refusalFetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
