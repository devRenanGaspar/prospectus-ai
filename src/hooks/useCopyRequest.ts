import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAgencyContext } from "@/hooks/useAgencyContext";
import { toast } from "sonner";

// request_copy returns `jsonb`, which the generator can only type as `Json`.
// This is the application-level contract the RPC actually honors.
interface RequestCopyResult {
  success: boolean;
  error?: string;
  lead_ids?: string[];
  charged?: number;
  cost?: number;
}

export const copyRequestPendingKey = (userId: string | undefined) => ["copy-request-pending", userId];

export const fetchPendingCopyRequest = async (userId: string) => {
  const { data, error } = await supabase
    .from("copy_requests")
    .select("id, created_at")
    .eq("user_id", userId)
    .eq("status", "processing")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
};

export const usePendingCopyRequest = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: copyRequestPendingKey(user?.id),
    queryFn: async () => {
      if (!user) return null;
      return fetchPendingCopyRequest(user.id);
    },
    enabled: !!user,
  });

  // Realtime: invalidate when N8N marks copy_requests as completed
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`copy-requests-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "copy_requests", filter: `user_id=eq.${user.id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: copyRequestPendingKey(user.id) });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, queryClient]);

  return query;
};

export const useRequestCopy = () => {
  const { user } = useAuth();
  const { data: agency } = useAgencyContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (leadIds: string[]) => {
      if (!user) throw new Error("Não autenticado");
      if (leadIds.length === 0) throw new Error("Nenhum lead selecionado");

      const copyRequestId = crypto.randomUUID();

      // Lock (which expires) + debit + transition to COPY_PENDING in a single
      // server-side transaction. Replaces the client's deduct + insert +
      // update trio, which was bypassable and could lose credit on a partial
      // failure.
      const { data, error } = await supabase.rpc("request_copy", {
        _lead_ids: leadIds,
        _request_id: copyRequestId,
      });
      if (error) throw error;

      const result = data as unknown as RequestCopyResult;
      if (!result?.success) {
        throw new Error(result?.error ?? "UNKNOWN_ERROR");
      }

      // Dispara o webhook apenas para os leads efetivamente cobrados/movidos.
      const chargedIds: string[] = result.lead_ids ?? leadIds;
      const context = {
        persona: agency?.context_persona,
        icp: agency?.context_icp,
        qualification: agency?.context_qualification,
      };

      // Fire-and-forget: not awaited by this mutation, matching the previous
      // behavior. Failure handling checks the *resolved* error, not .catch()
      // -- invoke() resolves { data: null, error } for HTTP, relay and
      // network failures rather than rejecting (verified against
      // @supabase/functions-js's source), so a .catch()-only handler here
      // was effectively dead code: a failed webhook charged credits and left
      // the leads in COPY_PENDING with nothing to notice or refund it.
      const refundOnFailure = (reason: unknown) => {
        console.error("Webhook copy_generation_requested failed:", reason);
        supabase.rpc("fail_copy_request", { _request_id: copyRequestId }).then(({ error: failErr }) => {
          if (failErr) console.error("fail_copy_request failed:", failErr);
        });
      };

      supabase.functions
        .invoke("webhook-proxy", {
          body: {
            type: "copy_generation_requested",
            action: "generate",
            payload: {
              agency_name: agency?.name || "",
              business_type: agency?.business_type || "trafego_pago",
              user_name: agency?.full_name || "",
              owner_name: agency?.owner_name || "",
              sdr_name: agency?.sdr_name || "MarIA",
              copy_request_id: copyRequestId,
              lead_ids: chargedIds,
              context,
            },
          },
        })
        .then(({ error: invokeError }) => {
          if (invokeError) refundOnFailure(invokeError);
        })
        // Kept as a backstop for a genuine thrown exception outside invoke()'s
        // own resolved-error handling (e.g. a bug in the SDK itself) -- not
        // the path this normally takes.
        .catch(refundOnFailure);

      return { count: result.charged ?? leadIds.length, cost: result.cost ?? 0 };
    },
    onSuccess: ({ count, cost }) => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["copy-request-pending"] });
      queryClient.invalidateQueries({ queryKey: ["credit-balance"] });
      toast.success(`Geração de copy iniciada para ${count} lead(s)! ${cost} créditos consumidos.`);
    },
    onError: (error: Error) => {
      if (error.message === "INSUFFICIENT_CREDITS") {
        toast.error("Créditos insuficientes. Adquira mais créditos para continuar.");
      } else if (error.message !== "COPY_IN_PROGRESS") {
        toast.error("Erro ao solicitar geração de copy.");
      }
    },
  });
};
