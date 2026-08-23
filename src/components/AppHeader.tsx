import { useState } from "react";
import { Bell, ChevronDown, LifeBuoy } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { SidebarTrigger } from "@/components/ui/sidebar";
import SearchInput from "@/components/SearchInput";
import CreditsBadge from "@/components/CreditsBadge";
import { useCreditBalance } from "@/hooks/useCreditBalance";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Link } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const AppHeader = () => {
  const { profile, signOut } = useAuth();
  const { data: creditBalance } = useCreditBalance();
  const [search, setSearch] = useState("");

  const initials = profile?.full_name
    ? profile.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U";

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border bg-background/80 backdrop-blur-md px-4 lg:px-6">
      <SidebarTrigger className="-ml-1" />

      <div className="flex-1 max-w-md hidden md:block">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Buscar leads, agências..."
          className="w-full"
        />
      </div>

      <div className="ml-auto flex items-center gap-3">
        <CreditsBadge balance={creditBalance ?? profile?.credits_balance ?? 0} />

        <Button variant="ghost" size="icon" className="relative" aria-label="Notificações">
          <Bell className="h-4 w-4" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary animate-pulse-glow" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 px-2">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="hidden lg:inline text-sm font-medium truncate max-w-[120px]">
                {profile?.full_name || "Usuário"}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <p className="text-sm font-medium">{profile?.full_name}</p>
              <p className="text-xs text-muted-foreground capitalize">{profile?.role?.toLowerCase()}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/settings">Configurações</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/billing/plans">Planos</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/settings?tab=support" className="gap-2">
                <LifeBuoy className="h-4 w-4" />
                Ajuda & Suporte
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

export default AppHeader;
