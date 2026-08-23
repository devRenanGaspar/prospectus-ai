// Same property as admin-update-password, for the endpoint that mints a
// magic link into another user's account instead of changing a password.
// The audit row is written BEFORE the link is minted, and a failed insert
// refuses the request rather than leaving an unrecorded magic link in
// existence.
import { assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { handler } from "../admin-impersonate/handler.ts";
import { fakeJwt, jsonRes, routedFetch, withFetch } from "./_supabase-stub.ts";

const ADMIN_ID = "admin-id";
const TARGET_ID = "target-id";

function callerToken() {
  return fakeJwt({ sub: ADMIN_ID, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 });
}

function request(body: Record<string, unknown>) {
  return new Request("https://example.com/", {
    method: "POST",
    headers: { Authorization: `Bearer ${callerToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const AUTH_AND_ROLE_ROUTES = [
  {
    match: "/auth/v1/user",
    handle: () => jsonRes({ id: ADMIN_ID, aud: "authenticated", role: "authenticated", email: "admin@example.com" }),
  },
  { match: `id=eq.${ADMIN_ID}`, handle: () => jsonRes({ role: "ADMIN" }) },
  {
    match: `id=eq.${TARGET_ID}`,
    handle: () => jsonRes({ id: TARGET_ID, full_name: "Target User", email: "target@example.com", role: "USER" }),
  },
];

Deno.test("a failed audit insert refuses the request and never mints a magic link", async () => {
  let linkMinted = false;
  await withFetch(
    routedFetch([
      ...AUTH_AND_ROLE_ROUTES,
      {
        match: "/admin_impersonation_logs",
        method: "POST",
        handle: () => jsonRes({ message: "connection reset", code: "08006" }, 500),
      },
      {
        match: "/auth/v1/admin/generate_link",
        handle: () => {
          linkMinted = true;
          return jsonRes({ properties: { action_link: "https://example.com/magic" } });
        },
      },
    ]),
    async () => {
      const res = await handler(request({ target_user_id: TARGET_ID }));
      assertEquals(res.status, 500);
      assertEquals(linkMinted, false);
    },
  );
});

Deno.test("a successful audit insert lets the link be minted, and the row is sealed to succeeded", async () => {
  let sealedOutcome: string | undefined;
  await withFetch(
    routedFetch([
      ...AUTH_AND_ROLE_ROUTES,
      {
        match: "/admin_impersonation_logs",
        method: "POST",
        handle: () => jsonRes({ id: "audit-row-id" }, 201),
      },
      {
        match: "/auth/v1/admin/generate_link",
        handle: () =>
          jsonRes({
            action_link: "https://example.com/magic",
            verification_type: "magiclink",
            user: { id: TARGET_ID, email: "target@example.com" },
          }),
      },
      {
        match: "/admin_impersonation_logs",
        method: "PATCH",
        handle: (init) => {
          const body = JSON.parse(String(init?.body ?? "{}"));
          sealedOutcome = body.outcome;
          return jsonRes({});
        },
      },
    ]),
    async () => {
      const res = await handler(request({ target_user_id: TARGET_ID }));
      const body = await res.json();
      assertEquals(res.status, 200);
      assertEquals(body.action_link, "https://example.com/magic");
      assertEquals(sealedOutcome, "succeeded");
    },
  );
});

Deno.test("a failed generate_link marks the audit row failed instead of leaving it pending", async () => {
  let sealedOutcome: string | undefined;
  await withFetch(
    routedFetch([
      ...AUTH_AND_ROLE_ROUTES,
      {
        match: "/admin_impersonation_logs",
        method: "POST",
        handle: () => jsonRes({ id: "audit-row-id" }, 201),
      },
      { match: "/auth/v1/admin/generate_link", handle: () => jsonRes({ error: "provider down" }, 500) },
      {
        match: "/admin_impersonation_logs",
        method: "PATCH",
        handle: (init) => {
          const body = JSON.parse(String(init?.body ?? "{}"));
          sealedOutcome = body.outcome;
          return jsonRes({});
        },
      },
    ]),
    async () => {
      const res = await handler(request({ target_user_id: TARGET_ID }));
      assertEquals(res.status, 500);
      assertEquals(sealedOutcome, "failed");
    },
  );
});

Deno.test("cannot impersonate another admin", async () => {
  await withFetch(
    routedFetch([
      {
        match: "/auth/v1/user",
        handle: () => jsonRes({ id: ADMIN_ID, aud: "authenticated", role: "authenticated", email: "admin@example.com" }),
      },
      { match: `id=eq.${ADMIN_ID}`, handle: () => jsonRes({ role: "ADMIN" }) },
      {
        match: `id=eq.${TARGET_ID}`,
        handle: () => jsonRes({ id: TARGET_ID, full_name: "Other Admin", email: "other@example.com", role: "ADMIN" }),
      },
    ]),
    async () => {
      const res = await handler(request({ target_user_id: TARGET_ID }));
      assertEquals(res.status, 403);
    },
  );
});
