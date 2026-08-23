import { Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

interface MaintenanceBlockProps {
  message: string | null;
}

const MaintenanceBlock = ({ message }: MaintenanceBlockProps) => {
  const { signOut } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto h-16 w-16 rounded-full gradient-primary flex items-center justify-center shadow-elegant">
          <Wrench className="h-8 w-8 text-primary-foreground" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Em manutenção</h1>
          <p className="text-muted-foreground leading-relaxed">
            {message?.trim()
              ? message
              : "Estamos realizando melhorias no sistema. Volte em alguns instantes."}
          </p>
        </div>
        <Button variant="outline" onClick={signOut} className="mt-4">
          Sair
        </Button>
      </div>
    </div>
  );
};

export default MaintenanceBlock;
