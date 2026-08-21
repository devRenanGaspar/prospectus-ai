import { Outlet } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import AppSidebar from "@/components/AppSidebar";
import AppHeader from "@/components/AppHeader";
import MaintenanceBanner from "@/components/MaintenanceBanner";
import MaintenanceBlock from "@/components/MaintenanceBlock";
import AnnouncementModal from "@/components/AnnouncementModal";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import { useMaintenanceMode } from "@/hooks/useMaintenanceMode";
import { useAuth } from "@/contexts/AuthContext";

const AppShell = () => {
  const { profile, profileStatus } = useAuth();
  const { data: maintenance } = useMaintenanceMode();
  const isAdmin = profile?.role === "ADMIN";
  const mode = maintenance?.mode ?? "off";

  // During maintenance, don't take the whole screen over until the profile has
  // settled: on a hard load `profile` is briefly null, which reads as "not an
  // admin" and would flash the block screen at the very admins whose escape
  // hatch it is.
  if (mode === "blocked" && !isAdmin && profileStatus !== "loading") {
    return <MaintenanceBlock message={maintenance?.message ?? null} />;
  }

  const adminBlockedNotice = mode === "blocked" && isAdmin;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <ImpersonationBanner />
          {mode === "banner" && (
            <MaintenanceBanner message={maintenance?.message ?? null} />
          )}
          {adminBlockedNotice && (
            <MaintenanceBanner
              message={`MODO BLOQUEIO ATIVO — usuários não-admin estão bloqueados. ${maintenance?.message ?? ""}`}
              dismissible={false}
            />
          )}
          <AppHeader />
          <main className="flex-1 overflow-hidden p-6 lg:p-8 flex flex-col">
            <Outlet />
          </main>
        </div>
      </div>
      <AnnouncementModal />
    </SidebarProvider>
  );
};

export default AppShell;
