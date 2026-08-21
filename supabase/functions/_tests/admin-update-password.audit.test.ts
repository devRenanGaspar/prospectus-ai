// admin-update-password writes its audit row BEFORE changing the password,
// and refuses the request if that write fails. Written after, a failed
// insert would leave an already-changed password with no record it ever
// happened; written before, a failed insert means the password is never
// touched at all. This drives the real handler through a routed fetch stub
// to prove the ORDER, not just that both calls exist in the source.
import { assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { handler } from "../admin-update-password/handler.ts";
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
    handle: () =>
      jsonRes({ id: ADMIN_ID, aud: "authenticated", role: "authenticated", email: "admin@example.com" }),
  },
  { match: `id=eq.${ADMIN_ID}`, handle: () => jsonRes({ role: "ADMIN" }) },
  {
    match: `id=eq.${TARGET_ID}`,
    handle: () => jsonRes({ id: TARGET_ID, role: "USER", email: "u@example.com" }),
  },
];

Deno.test("a failed audit insert refuses the request and never touches the password", async () => {
  let passwordChangeAttempted = false;
  await withFetch(
    routedFetch([
      ...AUTH_AND_ROLE_ROUTES,
      {
        match: "/admin_password_reset_logs",
        method: "POST",
        handle: () => jsonRes({ message: "connection reset", code: "08006" }, 500),
      },
      {
        match: "/auth/v1/admin/users/",
        handle: () => {
          passwordChangeAttempted = true;
          return jsonRes({ id: TARGET_ID });
        },
      },
    ]),
    async () => {
      const res = await handler(request({ user_id: TARGET_ID, new_password: "abcdef123" }));
      assertEquals(res.status, 500);
      assertEquals(passwordChangeAttempted, false);
    },
  );
});

Deno.test("a successful audit insert lets the password change proceed, and the row is sealed to succeeded", async () => {
  let sealedOutcome: string | undefined;
  await withFetch(
    routedFetch([
      ...AUTH_AND_ROLE_ROUTES,
      {
        match: "/admin_password_reset_logs",
        method: "POST",
        handle: () => jsonRes({ id: "audit-row-id" }, 201),
      },
      { match: "/auth/v1/admin/users/", handle: () => jsonRes({ id: TARGET_ID }) },
      {
        match: "/admin_password_reset_logs",
        method: "PATCH",
        handle: (init) => {
          const body = JSON.parse(String(init?.body ?? "{}"));
          sealedOutcome = body.outcome;
          return jsonRes({});
        },
      },
    ]),
    async () => {
      const res = await handler(request({ user_id: TARGET_ID, new_password: "abcdef123" }));
      assertEquals(res.status, 200);
      assertEquals(sealedOutcome, "succeeded");
    },
  );
});

Deno.test("a failed password change marks the audit row failed instead of leaving it pending", async () => {
  let sealedOutcome: string | undefined;
  await withFetch(
    routedFetch([
      ...AUTH_AND_ROLE_ROUTES,
      {
        match: "/admin_password_reset_logs",
        method: "POST",
        handle: () => jsonRes({ id: "audit-row-id" }, 201),
      },
      {
        match: "/auth/v1/admin/users/",
        handle: () => jsonRes({ error: { message: "provider unavailable" } }, 500),
      },
      {
        match: "/admin_password_reset_logs",
        method: "PATCH",
        handle: (init) => {
          const body = JSON.parse(String(init?.body ?? "{}"));
          sealedOutcome = body.outcome;
          return jsonRes({});
        },
      },
    ]),
    async () => {
      const res = await handler(request({ user_id: TARGET_ID, new_password: "abcdef123" }));
      assertEquals(res.status, 500);
      assertEquals(sealedOutcome, "failed");
    },
  );
});
