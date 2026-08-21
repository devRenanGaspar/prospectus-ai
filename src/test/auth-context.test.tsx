/**
 * Tests for AuthProvider's profile bootstrap (B2).
 *
 * These test the PRODUCER, deliberately. protected-route.test.tsx mocks
 * useAuth wholesale, so it validates how ProtectedRoute *interprets* a status
 * -- it would happily pass an implementation that sets `profileStatus` too
 * late. The defect being guarded here is one of asynchronous ordering inside
 * AuthContext itself: fetchProfile is intentionally not awaited before
 * `loading` flips to false, so there is a render with a session and a null
 * profile. If that render also reports `profileStatus: "resolved"`, every
 * consumer downstream is back to reading "not loaded yet" as "no permission".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

type ProfileResult = { data: unknown; error: unknown };

let sessionResult: { data: { session: unknown } };
let profileDeferred: {
  promise: Promise<ProfileResult>;
  resolve: (v: ProfileResult) => void;
};
const rpc = vi.fn();

const makeDeferred = () => {
  let resolve!: (v: ProfileResult) => void;
  const promise = new Promise<ProfileResult>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      // No auth events in these tests: the getSession path is the one a hard
      // load or a deep link actually takes.
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getSession: () => Promise.resolve(sessionResult),
    },
    rpc: (...args: unknown[]) => rpc(...args),
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => profileDeferred.promise,
        }),
      }),
    }),
  },
}));

import { AuthProvider, useAuth } from "@/contexts/AuthContext";

const Probe = () => {
  const { profileStatus, profile, loading } = useAuth();
  return (
    <div>
      <span data-testid="status">{profileStatus}</span>
      <span data-testid="role">{profile?.role ?? "none"}</span>
      <span data-testid="loading">{String(loading)}</span>
    </div>
  );
};

const renderProvider = () =>
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );

const SESSION = { session: { user: { id: "admin-1" } } };

beforeEach(() => {
  rpc.mockReset();
  profileDeferred = makeDeferred();
  sessionResult = { data: SESSION };
});

describe("AuthProvider profile bootstrap", () => {
  it("reports 'loading' -- not 'resolved' -- while the profile query is still in flight", async () => {
    renderProvider();

    // getSession has resolved (so `loading` is false and a session exists) but
    // the profile query has NOT. This is the exact window the admin gate used
    // to misread as "not an admin".
    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false");
    });

    expect(screen.getByTestId("status")).toHaveTextContent("loading");
    expect(screen.getByTestId("role")).toHaveTextContent("none");
  });

  it("moves to 'resolved' only after the profile arrives", async () => {
    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("loading");
    });

    await act(async () => {
      profileDeferred.resolve({ data: { id: "admin-1", role: "ADMIN" }, error: null });
    });

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("resolved");
    });
    expect(screen.getByTestId("role")).toHaveTextContent("ADMIN");
  });

  it("moves to 'error' when the profile fetch fails and the user is not BLOCKED", async () => {
    rpc.mockResolvedValue({ data: "USER", error: null });
    renderProvider();

    await act(async () => {
      profileDeferred.resolve({ data: null, error: { message: "network down" } });
    });

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("error");
    });
    // A transient failure must not clear a profile or invent one.
    expect(screen.getByTestId("role")).toHaveTextContent("none");
  });

  it("resolves a BLOCKED user through the RPC fallback rather than erroring", async () => {
    rpc.mockResolvedValue({ data: "BLOCKED", error: null });
    renderProvider();

    await act(async () => {
      profileDeferred.resolve({ data: null, error: { message: "rls denied" } });
    });

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("resolved");
    });
    expect(screen.getByTestId("role")).toHaveTextContent("BLOCKED");
  });

  it("is 'resolved' immediately when there is no session at all", async () => {
    sessionResult = { data: { session: null } };
    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false");
    });
    // Nothing to wait for: an anonymous visitor must not sit on a spinner.
    expect(screen.getByTestId("status")).toHaveTextContent("resolved");
  });
});
