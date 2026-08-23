import { useAuth } from "@/contexts/AuthContext";
import type { UserRole } from "@/lib/constants";

interface PermissionGateProps {
  requiredRole: UserRole;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

const PermissionGate = ({ requiredRole, children, fallback = null }: PermissionGateProps) => {
  const { profile } = useAuth();

  if (requiredRole === "ADMIN" && profile?.role !== "ADMIN") {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};

export default PermissionGate;
