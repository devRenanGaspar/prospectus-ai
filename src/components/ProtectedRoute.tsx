import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";
import ErrorState from "@/components/ErrorState";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: "ADMIN" | "USER";
  /**
   * Rendered instead of redirecting to /login when there is no session --
   * only takes effect at the exact root path ("/"), so nested routes under
   * this same layout (e.g. /dashboard) keep redirecting to /login as before.
   */
  publicFallback?: React.ReactNode;
}

const ProtectedRoute = ({ children, requiredRole, publicFallback }: ProtectedRouteProps) => {
  const { user, profile, profileStatus, loading, signOut } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (profile?.role === "BLOCKED") void signOut();
  }, [profile?.role, signOut]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    if (publicFallback && location.pathname === "/") return <>{publicFallback}</>;
    return <Navigate to="/login" replace />;
  }

  if (profile?.role === "BLOCKED") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center">
        <div className="max-w-sm space-y-2">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Sua sessão está sendo encerrada.</p>
        </div>
      </div>
    );
  }

  // Only decide an authorization question once the profile has actually
  // settled. `loading` above covers the session, not the profile: fetchProfile
  // is not awaited, so there is always a render with a session and profile
  // still null. Reading that as "not an admin" redirected every admin who
  // hard-loaded or deep-linked an /admin/* URL, and <Navigate replace> commits
  // immediately -- by the time the profile arrived they were already gone.
  if (requiredRole && profileStatus === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // A failed profile fetch is not a permission answer either. Say so instead of
  // bouncing the user somewhere with no explanation.
  if (requiredRole && profileStatus === "error") {
    return (
      <ErrorState
        title="Não foi possível verificar suas permissões"
        description="Recarregue a página para tentar novamente."
      />
    );
  }

  if (requiredRole === "ADMIN" && profile?.role !== "ADMIN") {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
