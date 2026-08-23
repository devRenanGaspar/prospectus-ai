import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// request_send returns `jsonb`, which the generator can only type as `Json`.
// This is the application-level contract the RPC actually honors.
interface RequestSendResult {
  success: boolean;
  error?: string;
  charged?: number;
  cost?: number;
}

export const useRequestSend = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (leadIds: string[]) => {
      if (!user) throw new Error("Não autenticado");
      if (leadIds.length === 0) throw new Error("Nenhum lead selecionado");

      const sendRequestId = crypto.randomUUID();

      // Debit + transition to SEND_PENDING in a single server-side
      // transaction. The charge and the status change are atomic and
      // idempotent by request_id: there's no way to enqueue without paying,
      // or lose credit on a partial failure. N8N polls the SEND_PENDING status.
      const { data, error } = await supabase.rpc("request_send", {
        _lead_ids: leadIds,
        _request_id: sendRequestId,
      });
      if (error) throw error;

      const result = data as unknown as RequestSendResult;
      if (!result?.success) {
        throw new Error(result?.error ?? "UNKNOWN_ERROR");
      }

      return { count: result.charged ?? leadIds.length, cost: result.cost ?? 0 };
    },
    onSuccess: ({ count, cost }) => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["credit-balance"] });
      toast.success(
        `${count} lead(s) na fila de envio. ${cost} créditos consumidos. O envio acontece automaticamente (~1 lead a cada 30 min).`
      );
    },
    onError: (error: Error) => {
      if (error.message === "INSUFFICIENT_CREDITS") {
        toast.error("Créditos insuficientes. Adquira mais créditos para continuar.");
      } else {
        toast.error("Erro ao adicionar leads à fila de envio.");
      }
    },
  });
};
