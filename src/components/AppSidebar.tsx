import {
  LayoutDashboard,
  Users,
  Settings,
  Zap,
  CreditCard,
  Shield,
  FileText,
  Target,
  Webhook,
  Layers,
  Wrench,
  Megaphone,
  HeartPulse,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { LogOut } from "lucide-react";
import { Separator } from "@/components/ui/separator";

const mainNav = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Contexto", url: "/context", icon: Target },
  { title: "Leads", url: "/leads/board", icon: Users },
  { title: "Planos", url: "/billing/plans", icon: CreditCard },
  { title: "Extrato", url: "/billing/usage", icon: Zap },
  { title: "Configurações", url: "/settings", icon: Settings },
];

const adminNav = [
  { title: "Saúde do sistema", url: "/admin/system-health", icon: HeartPulse },
  { title: "Usuários", url: "/admin/users", icon: Shield },
  { title: "Planos", url: "/admin/plans", icon: FileText },
  { title: "Custos", url: "/admin/costs", icon: Zap },
  { title: "Webhooks", url: "/admin/webhooks", icon: Webhook },
  { title: "Lead Pool", url: "/admin/lead-pool", icon: Layers },
  { title: "Mensagens", url: "/admin/announcements", icon: Megaphone },
  { title: "Manutenção", url: "/admin/maintenance", icon: Wrench },
];

const AppSidebar = () => {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { profile, signOut } = useAuth();
  const isAdmin = profile?.role === "ADMIN";

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + "/");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 shrink-0 rounded-lg gradient-primary flex items-center justify-center">
            <Zap className="h-4 w-4 text-primary-foreground" />
          </div>
          {!collapsed && (
            <span className="font-bold text-lg tracking-tight text-sidebar-foreground">
              Prospectus
            </span>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <NavLink
                      to={item.url}
                      end={item.url === "/dashboard"}
                      className="hover:bg-sidebar-accent/50"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <>
            <Separator className="mx-4 bg-sidebar-border" />
            <SidebarGroup>
              <SidebarGroupLabel>Admin</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {adminNav.map((item) => (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                        <NavLink
                          to={item.url}
                          className="hover:bg-sidebar-accent/50"
                          activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        >
                          <item.icon className="h-4 w-4" />
                          {!collapsed && <span>{item.title}</span>}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut} tooltip="Sair">
              <LogOut className="h-4 w-4" />
              {!collapsed && <span>Sair</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
};

export default AppSidebar;
