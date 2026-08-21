import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type DeletionRequestResult = {
  success: boolean;
  created: boolean;
  request_id: string;
  requested_at: string;
  due_at: string;
};

/**
 * Records an account deletion request.
 *
 * This does not delete anything. Fulfilment is manual, tracked through
 * `ops_pending_account_deletions` and a daily alert; the committed SLA is
 * acknowledge within 48h, complete within 30 days.
 *
 * REGRESSION: the previous version of this flow fired a success toast and
 * closed the dialog without making any call at all, while the dialog promised
 * permanent erasure within 30 business days. Nothing was recorded, so nothing
 * could be honoured. Every path below must reach the server before it reports
 * success.
 */
export const useRequestAccountDeletion = () =>
  useMutation({
    mutationFn: async (): Promise<DeletionRequestResult> => {
      const { data, error } = await supabase.rpc("request_account_deletion");
      if (error) throw error;

      const result = data as unknown as DeletionRequestResult | null;
      if (!result?.success) {
        throw new Error("DELETION_REQUEST_FAILED");
      }
      return result;
    },
    onSuccess: (result) => {
      toast.success(
        result.created
          ? "Solicitação registrada. Confirmamos em até 48h e concluímos a exclusão em até 30 dias."
          : "Você já tem uma solicitação de exclusão em andamento. Entraremos em contato.",
      );
    },
    onError: () => {
      toast.error(
        "Não foi possível registrar a solicitação. Tente novamente ou fale com o suporte.",
      );
    },
  });
