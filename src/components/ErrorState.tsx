import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}

const ErrorState = ({
  title = "Algo deu errado",
  description = "Não foi possível carregar os dados. Tente novamente.",
  onRetry,
  className,
}: ErrorStateProps) => (
  <div className={cn("flex flex-col items-center justify-center py-16 text-center animate-fade-in", className)}>
    <div className="rounded-2xl bg-destructive/10 p-4 mb-4">
      <AlertTriangle className="h-8 w-8 text-destructive" />
    </div>
    <h3 className="text-lg font-semibold mb-1">{title}</h3>
    <p className="text-sm text-muted-foreground max-w-sm mb-6">{description}</p>
    {onRetry && (
      <Button variant="outline" onClick={onRetry}>
        <RefreshCw className="h-4 w-4 mr-2" />
        Tentar novamente
      </Button>
    )}
  </div>
);

export default ErrorState;
