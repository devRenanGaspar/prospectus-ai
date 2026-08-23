/**
 * Tests for the root-path landing behaviour (M1).
 *
 * The homepage used to be inside ProtectedRoute unconditionally, so an
 * anonymous visitor hitting "/" was redirected straight to /login instead of
 * seeing the public landing page. publicFallback fixes that for the exact
 * root path only -- these tests exist to pin that "only" down, since the same
 * ProtectedRoute instance is the layout for every nested route under "/"
 * (e.g. /dashboard), which must keep redirecting anonymous visitors to
 * /login exactly as before.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

let mockAuth: {
  user: { id: string } | null;
  profile: { role?: string } | null;
  profileStatus: "loading" | "resolved" | "error";
  loading: boolean;
};

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ ...mockAuth, signOut: vi.fn() }),
}));

import ProtectedRoute from "@/components/ProtectedRoute";

const Landing = () => <div>landing page</div>;
const Login = () => <div>login page</div>;
const Dashboard = () => <div>dashboard page</div>;
const AdminPage = () => <div>admin page</div>;

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/admin/users"
          element={<ProtectedRoute requiredRole="ADMIN"><AdminPage /></ProtectedRoute>}
        />
        <Route path="/" element={<ProtectedRoute publicFallback={<Landing />}><Dashboard /></ProtectedRoute>}>
          <Route path="dashboard" element={<Dashboard />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

describe("ProtectedRoute publicFallback (M1 -- root landing)", () => {
  it("shows the landing page at the exact root path when signed out", () => {
    mockAuth = { user: null, profile: null, profileStatus: "resolved", loading: false };
    renderAt("/");
    expect(screen.getByText("landing page")).toBeInTheDocument();
  });

  it("still redirects a signed-out visitor away from a nested route (e.g. /dashboard)", () => {
    mockAuth = { user: null, profile: null, profileStatus: "resolved", loading: false };
    renderAt("/dashboard");
    expect(screen.getByText("login page")).toBeInTheDocument();
  });

  it("renders the protected content at root when signed in, not the landing page", () => {
    mockAuth = { user: { id: "u1" }, profile: { role: "USER" }, profileStatus: "resolved", loading: false };
    renderAt("/");
    expect(screen.getByText("dashboard page")).toBeInTheDocument();
  });
});

/**
 * The admin gate and the unresolved-profile window.
 *
 * AuthContext does not await fetchProfile before flipping `loading` to false,
 * so there is always at least one render with a session and a null profile.
 * Reading that as "not an admin" sent every admin who refreshed or deep-linked
 * an /admin/* URL to /dashboard -- and <Navigate replace> commits immediately,
 * so the redirect stuck even after the profile arrived. The admin area only
 * worked via in-SPA navigation.
 */
describe("ProtectedRoute requiredRole (B2 -- profile not yet resolved)", () => {
  it("waits instead of redirecting while the profile is still loading", () => {
    mockAuth = { user: { id: "admin1" }, profile: null, profileStatus: "loading", loading: false };
    renderAt("/admin/users");

    // The bug: this rendered the dashboard, permanently.
    expect(screen.queryByText("dashboard page")).not.toBeInTheDocument();
    expect(screen.queryByText("admin page")).not.toBeInTheDocument();
  });

  it("renders the admin page once the profile resolves as ADMIN", () => {
    mockAuth = { user: { id: "admin1" }, profile: { role: "ADMIN" }, profileStatus: "resolved", loading: false };
    renderAt("/admin/users");
    expect(screen.getByText("admin page")).toBeInTheDocument();
  });

  it("still redirects a resolved non-admin away from an admin route", () => {
    mockAuth = { user: { id: "u1" }, profile: { role: "USER" }, profileStatus: "resolved", loading: false };
    renderAt("/admin/users");
    expect(screen.getByText("dashboard page")).toBeInTheDocument();
  });

  it("surfaces an error instead of silently redirecting when the profile fetch failed", () => {
    mockAuth = { user: { id: "admin1" }, profile: null, profileStatus: "error", loading: false };
    renderAt("/admin/users");
    expect(screen.getByText("Não foi possível verificar suas permissões")).toBeInTheDocument();
    expect(screen.queryByText("dashboard page")).not.toBeInTheDocument();
  });
});
