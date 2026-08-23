import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MaintenanceBannerProps {
  message: string | null;
  dismissible?: boolean;
  variant?: "warning" | "info";
}

const MaintenanceBanner = ({ message, dismissible = true, variant = "warning" }: MaintenanceBannerProps) => {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const tone =
    variant === "warning"
      ? "bg-yellow-500/15 text-yellow-200 border-yellow-500/30"
      : "bg-primary/15 text-primary-foreground border-primary/30";

  return (
    <div className={`w-full border-b ${tone}`}>
      <div className="flex items-center gap-3 px-4 py-2.5 text-sm">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <p className="flex-1 leading-snug">
          {message?.trim()
            ? message
            : "Manutenção em andamento. Algumas funcionalidades podem ficar instáveis."}
        </p>
        {dismissible && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 hover:bg-foreground/10"
            onClick={() => setDismissed(true)}
            aria-label="Fechar aviso"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
};

export default MaintenanceBanner;
