// A minimal router-based fetch stub for tests that drive a handler through
// enough of the real Supabase Auth + PostgREST surface to exercise a full
// request. It is not a mock of the handler's logic -- it only controls what
// the network returns, the same way n8n-proxy's tests do.
export type RouteHandlers = Record<string, (init: RequestInit | undefined) => Response>;

// Supabase Auth accepts any structurally-valid, unsigned JWT under `getClaims`
// when the network call it makes (`GET /auth/v1/user`) is stubbed to answer
// for the token's own `sub` -- verification happens against the stubbed
// response, not the signature, since nothing here holds Supabase's real
// signing key.
export function fakeJwt(payload: Record<string, unknown>): string {
  const b64url = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const header = { alg: "HS256", typ: "JWT" };
  return `${b64url(header)}.${b64url(payload)}.fake-signature`;
}

export function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/**
 * Routes fetch calls by matching, in order, a substring against the request
 * URL (and optionally the method). The first match wins; unmatched requests
 * get a generic empty 200, which is enough for PostgREST calls whose result
 * this test doesn't care about.
 */
export function routedFetch(routes: Array<{ match: string; method?: string; handle: (init: RequestInit | undefined) => Response }>): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";
    for (const route of routes) {
      if (url.includes(route.match) && (!route.method || route.method === method)) {
        return Promise.resolve(route.handle(init));
      }
    }
    return Promise.resolve(jsonRes({}));
  }) as typeof fetch;
}

export async function withFetch(stub: typeof fetch, run: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = stub;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}
