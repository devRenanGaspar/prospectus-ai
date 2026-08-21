import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface PromptsData {
  prompt_abordagem: string | null;
  prompt_sdr: string | null;
}

export const usePrompts = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["prompts", user?.id],
    queryFn: async (): Promise<PromptsData> => {
      if (!user) throw new Error("Não autenticado");

      const { data, error } = await supabase
        .from("profiles")
        .select("prompt_abordagem, prompt_sdr")
        .eq("id", user.id)
        .single();

      if (error) throw error;
      return {
        prompt_abordagem: data?.prompt_abordagem ?? null,
        prompt_sdr: data?.prompt_sdr ?? null,
      };
    },
    enabled: !!user,
  });
};

export const useValidatePrompt = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      promptType,
      content,
    }: {
      promptType: "prompt_abordagem" | "prompt_sdr";
      content: string;
    }) => {
      if (!user) throw new Error("Não autenticado");

      // Send to webhook for validation
      const { data, error } = await supabase.functions.invoke("webhook-proxy", {
        body: {
          type: "prompt_validation",
          action: "validate",
          payload: {
            user_id: user.id,
            prompt_type: promptType,
            content,
          },
        },
      });

      if (error) throw error;

      const result = data as { status: string; reason?: string };

      if (result.status === "approved") {
        // Save to database
        const { error: updateErr } = await supabase
          .from("profiles")
          .update({ [promptType]: content })
          .eq("id", user.id);
        if (updateErr) throw updateErr;

        return { status: "approved" as const };
      } else {
        return {
          status: "rejected" as const,
          reason: result.reason || "Prompt rejeitado pelo validador.",
        };
      }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["prompts"] });
      if (result.status === "approved") {
        toast.success("Prompt validado e salvo com sucesso!");
      } else {
        toast.error(`Prompt rejeitado: ${result.reason}`);
      }
    },
    onError: () => {
      toast.error("Erro ao validar prompt. Tente novamente.");
    },
  });
};

export const useRestoreDefaultPrompt = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (promptType: "prompt_abordagem" | "prompt_sdr") => {
      if (!user) throw new Error("Não autenticado");

      const { data, error } = await supabase.functions.invoke("webhook-proxy", {
        body: {
          type: "prompt_validation",
          action: "restore_default",
          payload: {
            user_id: user.id,
            prompt_type: promptType,
          },
        },
      });

      if (error) throw error;

      const result = data as { content: string };

      // Save the default prompt
      const { error: updateErr } = await supabase
        .from("profiles")
        .update({ [promptType]: result.content })
        .eq("id", user.id);
      if (updateErr) throw updateErr;

      return { content: result.content, promptType };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prompts"] });
      toast.success("Prompt padrão restaurado com sucesso!");
    },
    onError: () => {
      toast.error("Erro ao restaurar prompt padrão.");
    },
  });
};
