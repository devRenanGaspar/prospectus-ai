import { useEffect, useState } from "react";
import { ShieldAlert, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { IMPERSONATION_KEY, type ImpersonationState } from "@/hooks/useImpersonate";

const ImpersonationBanner = () => {
  const [state, setState] = useState<ImpersonationState | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem(IMPERSONATION_KEY);
    if (raw) {
      try {
        setState(JSON.parse(raw));
      } catch {
        sessionStorage.removeItem(IMPERSONATION_KEY);
      }
    }
  }, []);

  if (!state) return null;

  const handleExit = async () => {
    sessionStorage.removeItem(IMPERSONATION_KEY);
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <div className="bg-destructive text-destructive-foreground px-4 py-2 flex items-center justify-between gap-3 shadow-md z-50">
      <div className="flex items-center gap-2 text-sm font-medium">
        <ShieldAlert className="h-4 w-4 shrink-0" />
        <span>
          Modo Admin: você está logado como <strong>{state.target_name}</strong>
        </span>
      </div>
      <Button
        variant="secondary"
        size="sm"
        onClick={handleExit}
        className="h-7 gap-1.5"
      >
        <LogOut className="h-3.5 w-3.5" />
        Sair desse modo
      </Button>
    </div>
  );
};

export default ImpersonationBanner;
