import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface WebhookConfig {
  id: string;
  type: string;
  url: string;
  timeout_seconds: number;
  is_active: boolean;
  created_at: string;
}

export const useWebhookConfigs = () => {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["webhook_configs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("webhook_configs")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as WebhookConfig[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (config: Partial<WebhookConfig> & { type: string; url: string }) => {
      if (config.id) {
        const { error } = await supabase
          .from("webhook_configs")
          .update({
            type: config.type,
            url: config.url,
            timeout_seconds: config.timeout_seconds ?? 30,
            is_active: config.is_active ?? true,
          })
          .eq("id", config.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("webhook_configs")
          .insert({
            type: config.type,
            url: config.url,
            timeout_seconds: config.timeout_seconds ?? 30,
            is_active: config.is_active ?? true,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["webhook_configs"] });
      toast.success("Webhook salvo com sucesso!");
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao salvar webhook."),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("webhook_configs")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["webhook_configs"] });
      toast.success("Webhook removido.");
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao remover webhook."),
  });

  return {
    configs: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    upsert,
    remove,
  };
};
