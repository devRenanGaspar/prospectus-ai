import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMaintenanceMode, MaintenanceMode } from "@/hooks/useMaintenanceMode";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import MaintenanceBanner from "@/components/MaintenanceBanner";
import { toast } from "sonner";
import { AlertTriangle, Wrench } from "lucide-react";
import LoadingState from "@/components/LoadingState";
import ErrorState from "@/components/ErrorState";

const AdminMaintenance = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useMaintenanceMode();

  const [mode, setMode] = useState<MaintenanceMode>("off");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (data) {
      setMode(data.mode);
      setMessage(data.message ?? "");
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: async (payload: { mode: MaintenanceMode; message: string }) => {
      const { error } = await supabase
        .from("app_settings")
        .update({
          maintenance_mode: payload.mode,
          maintenance_message: payload.message.trim() || null,
          maintenance_started_at: payload.mode !== "off" ? new Date().toISOString() : null,
          updated_by: user?.id ?? null,
        })
        .eq("id", true);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["app-settings", "maintenance"] });
      toast.success("Configuração de manutenção atualizada");
    },
    onError: (err: Error) => {
      toast.error("Erro ao salvar", { description: err.message });
    },
  });

  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (isLoading) return <LoadingState variant="page" count={3} />;

  const isActive = mode !== "off";

  return (
    <div className="space-y-6 overflow-y-auto pb-8">
      <PageHeader
        title="Manutenção"
        description="Controle avisos e bloqueio total do sistema para usuários."
      />

      <Card>
        <CardHeader>
          <CardTitle>Modo de manutenção</CardTitle>
          <CardDescription>
            Escolha como o sistema deve se comportar durante a manutenção. Administradores nunca são bloqueados.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="mode">Modo</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as MaintenanceMode)}>
              <SelectTrigger id="mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Desativado</SelectItem>
                <SelectItem value="banner">Aviso (banner no topo)</SelectItem>
                <SelectItem value="blocked">Bloqueio total (tela de manutenção)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              <strong>Banner:</strong> usuários veem um aviso e continuam usando.{" "}
              <strong>Bloqueio total:</strong> usuários não-admin veem apenas a tela de manutenção.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Mensagem exibida</Label>
            <Textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ex: Estamos realizando melhorias. Voltamos em 30 minutos."
              rows={3}
            />
          </div>

          {mode === "blocked" && (
            <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Bloqueio total impede <strong>todos os usuários não-admin</strong> de acessar qualquer página interna.
              </span>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              onClick={() => mutation.mutate({ mode, message })}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
            {isActive && (
              <Button
                variant="outline"
                onClick={() => {
                  setMode("off");
                  mutation.mutate({ mode: "off", message: "" });
                }}
                disabled={mutation.isPending}
              >
                Desativar manutenção
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {mode !== "off" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pré-visualização</CardTitle>
          </CardHeader>
          <CardContent>
            {mode === "banner" ? (
              <div className="overflow-hidden rounded-md border">
                <MaintenanceBanner message={message} dismissible={false} />
              </div>
            ) : (
              <div className="rounded-md border bg-background p-8 text-center">
                <Wrench className="mx-auto h-10 w-10 text-primary mb-3" />
                <h2 className="text-lg font-semibold mb-1">Em manutenção</h2>
                <p className="text-sm text-muted-foreground">
                  {message.trim() || "Estamos realizando melhorias no sistema. Volte em alguns instantes."}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AdminMaintenance;
