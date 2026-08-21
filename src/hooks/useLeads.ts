import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAgencyContext } from "@/hooks/useAgencyContext";
import { toast } from "sonner";
import type { LeadStatus } from "@/lib/constants";
import { useEffect } from "react";

// request_find_leads returns `jsonb`, which the generator can only type as
// `Json`. This is the application-level contract the RPC actually honors.
interface RequestFindLeadsResult {
  success: boolean;
  error?: string;
  cost?: number;
}

export interface Lead {
  id: string;
  name: string;
  company_name: string | null;
  source: string | null;
  status: string;
  contact_info: Record<string, unknown> | null;
  ai_generated_copy: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
  user_id: string;
  assigned_user_id: string | null;
  google_place_id: string | null;
  phone: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  total_score: string | null;
  reviews_count: string | null;
  rank: string | null;
  website: string | null;
  images_count: string | null;
  image_url: string | null;
  category_name: string | null;
  cnpj: string | null;
  instagram: string | null;
  lead_replied: string | null;
  lead_reply_score: string | null;
  mensagem_abordagem_comercial: string | null;
  search_id: string | null;
  ai_agent_enabled: boolean;
  website_analysis: string | null;
}

export const useLeads = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["leads", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
    enabled: !!user,
  });

  // Realtime subscription
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`leads-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads", filter: `user_id=eq.${user.id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["leads", user.id] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, queryClient]);

  return query;
};

export const useUpdateLeadStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ leadId, status }: { leadId: string; status: LeadStatus }) => {
      // Defense in depth: COPY_PENDING and SEND_PENDING require the
      // copy_requests / send_requests flow (credit charge + N8N webhook).
      // Use useRequestCopy / useRequestSend for those transitions.
      if (status === "COPY_PENDING" || status === "SEND_PENDING") {
        throw new Error("INVALID_DIRECT_TRANSITION");
      }
      const { error } = await supabase
        .from("leads")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", leadId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (error: Error) => {
      if (error.message === "INVALID_DIRECT_TRANSITION") {
        toast.error("Esta transição precisa passar pelo fluxo de geração de copy ou envio.");
        return;
      }
      toast.error("Erro ao atualizar status do lead.");
    },
  });
};

export const useBulkUpdateLeadStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ leadIds, status }: { leadIds: string[]; status: LeadStatus }) => {
      if (status === "COPY_PENDING" || status === "SEND_PENDING") {
        throw new Error("INVALID_DIRECT_TRANSITION");
      }
      if (leadIds.length === 0) return;
      const { error } = await supabase
        .from("leads")
        .update({ status, updated_at: new Date().toISOString() })
        .in("id", leadIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (error: Error) => {
      if (error.message === "INVALID_DIRECT_TRANSITION") {
        toast.error("Esta transição precisa passar pelo fluxo de geração de copy ou envio.");
        return;
      }
      toast.error("Erro ao atualizar status dos leads.");
    },
  });
};

export interface FindLeadsParams {
  quantity: number;
  limitPerNiche: number;
  requireWebsite: boolean;
  requireInstagram: boolean;
  agencyOverride?: {
    name?: string;
    business_type?: string;
    context_persona?: unknown;
    context_icp?: unknown;
    context_qualification?: unknown;
  };
}

export const useFindNewLeads = () => {
  const { user } = useAuth();
  const { data: agency } = useAgencyContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ quantity, limitPerNiche, requireWebsite, requireInstagram, agencyOverride }: FindLeadsParams) => {
      if (!user) throw new Error("Não autenticado");

      // Use override (fresh values just confirmed by the user) when provided,
      // otherwise fall back to the cached agency context.
      const effectiveAgency = {
        name: agencyOverride?.name ?? agency?.name,
        business_type: agencyOverride?.business_type ?? agency?.business_type,
        context_persona: agencyOverride?.context_persona ?? agency?.context_persona,
        context_icp: agencyOverride?.context_icp ?? agency?.context_icp,
        context_qualification: agencyOverride?.context_qualification ?? agency?.context_qualification,
      };

      // Lock (which expires) + debit + search creation, atomic on the server.
      // Replaces the client's lock check + deduct + insert, which allowed
      // creating a search without paying and could lose credit on a partial
      // failure.
      const searchId = crypto.randomUUID();
      const { data, error } = await supabase.rpc("request_find_leads", {
        _quantity: quantity,
        _limit_per_niche: limitPerNiche,
        _request_id: searchId,
        _require_website: requireWebsite,
        _require_instagram: requireInstagram,
      });
      if (error) throw error;

      const result = data as unknown as RequestFindLeadsResult;
      if (!result?.success) {
        throw new Error(result?.error ?? "UNKNOWN_ERROR");
      }

      // Fire-and-forget webhook call with search_id
      const context = {
        persona: effectiveAgency.context_persona,
        icp: effectiveAgency.context_icp,
        qualification: effectiveAgency.context_qualification,
      };

      // invoke() *resolves* { data: null, error } for HTTP, relay and network
      // failures rather than rejecting, so the `.catch()`-only handler that
      // used to be here never ran for the failures that actually happen: the
      // search charged credits, the webhook failed, and `fail_search` -- the
      // thing that refunds them -- was never reached.
      const failSearch = async (reason: unknown) => {
        console.error("Webhook find_leads failed (background):", reason);
        // Fail the search via RPC (refunds the credits). A direct status
        // UPDATE was locked out in the database to prevent improper clawback.
        const { error: refundError } = await supabase.rpc("fail_search", {
          _search_id: searchId,
        });
        if (refundError) {
          // The compensation failing is the same defect one level down, and
          // it is the expensive one: the user paid and nothing says so.
          console.error("fail_search did not complete:", refundError);
          toast.error("A busca falhou e o estorno não foi concluído. Fale com o suporte.");
          return;
        }
        toast.error("A busca falhou. Os créditos foram estornados.");
      };
      supabase.functions
        .invoke("webhook-proxy", {
          body: {
            type: "find_leads",
            action: "search",
            payload: {
              agency_name: effectiveAgency.name,
              business_type: effectiveAgency.business_type || "trafego_pago",
              search_id: searchId,
              quantity,
              limit_per_niche: limitPerNiche,
              require_website: requireWebsite,
              require_instagram: requireInstagram,
              context,
            },
          },
        })
        .then(({ error: webhookError }) => {
          if (webhookError) return failSearch(webhookError);
        })
        .catch(failSearch);

      return { cost: result.cost };
    },
    onSuccess: ({ cost }) => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["credit-balance"] });
      toast.success(`Busca de leads iniciada! ${cost} créditos consumidos.`);
    },
    onError: (error: Error) => {
      if (error.message === "INSUFFICIENT_CREDITS") {
        toast.error("Créditos insuficientes. Adquira mais créditos para continuar.");
      } else if (error.message !== "SEARCH_IN_PROGRESS") {
        toast.error("Erro ao buscar leads. Tente novamente.");
      }
    },
  });
};
