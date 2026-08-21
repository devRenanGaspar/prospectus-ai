import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";
import { DEFAULT_BUSINESS_TYPE, type BusinessType } from "@/lib/business-types";

export interface AgencyICP {
  nichoPrincipal: string;
  nichoSecundario: string;
  nichoAlternativo: string;
  localizacao: string; // legado: string concatenada "Cidade, Estado"
  estado?: string;     // sigla do estado (IBGE), ex. "SP"
  cidade?: string;     // nome do município (IBGE)
  idioma: string;
}

export interface QualificationCriteria {
  superQualificado: string[];
  emAnalise: string[];
  desqualificado: string[];
}

export interface FaqItem {
  pergunta: string;
  resposta: string;
}

export interface SdrDaySlot {
  enabled: boolean;
  start: string;
  end: string;
}

export interface SdrAvailability {
  days: Record<string, SdrDaySlot>;
  lunch: SdrDaySlot;
}

export interface AgencyContextData {
  name: string;
  full_name: string | null;
  owner_name: string | null;
  sdr_name: string;
  context_persona: string | null;
  context_icp: AgencyICP;
  context_qualification: QualificationCriteria;
  context_faq: FaqItem[];
  sdr_phone: string | null;
  sdr_availability: SdrAvailability | null;
  business_type: BusinessType;
}

const defaultICP: AgencyICP = {
  nichoPrincipal: "",
  nichoSecundario: "",
  nichoAlternativo: "",
  localizacao: "",
  estado: "",
  cidade: "",
  idioma: "",
};

const defaultQualification: QualificationCriteria = {
  superQualificado: [
    "Já investe em tráfego pago",
    "Está buscando escala, não salvação do negócio",
    "Pode investir pelo menos 2 mil reais em tráfego",
  ],
  emAnalise: [
    "Entende que o tráfego vai gerar leads, mas não adianta se ele não conseguir atender bem",
    "Tem site e instagram",
  ],
  desqualificado: [
    "Quer investir menos de mil reais",
    "Precisa de resultado em 1 mês",
  ],
};

export const useAgencyContext = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["agency-context", user?.id],
    queryFn: async () => {
      if (!user) throw new Error("Não autenticado");

      const { data, error } = await supabase
        .from("profiles")
        .select("agency_name, full_name, owner_name, sdr_name, context_persona, context_icp, context_qualification, context_faq, sdr_phone, sdr_availability, business_type")
        .eq("id", user.id)
        .single();

      if (error) throw error;
      if (!data) return null;

      return {
        name: data.agency_name,
        full_name: data.full_name ?? null,
        owner_name: data.owner_name ?? null,
        sdr_name: data.sdr_name ?? "MarIA",
        context_persona: data.context_persona,
        context_icp: (data.context_icp as unknown as AgencyICP) ?? defaultICP,
        context_qualification:
          (data.context_qualification as unknown as QualificationCriteria) ?? defaultQualification,
        context_faq: (data.context_faq as unknown as FaqItem[]) ?? [],
        sdr_phone: data.sdr_phone ?? null,
        sdr_availability: (data.sdr_availability as unknown as SdrAvailability) ?? null,
        business_type: (data.business_type as BusinessType) ?? DEFAULT_BUSINESS_TYPE,
      } as AgencyContextData;
    },
    enabled: !!user,
  });
};

export const useUpdateAgencyContext = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ data, silent }: { data: AgencyContextData; silent?: boolean }) => {
      if (!user) throw new Error("Não autenticado");

      const payload = {
        agency_name: data.name.trim(),
        owner_name: data.owner_name?.trim() || null,
        sdr_name: data.sdr_name?.trim() || "MarIA",
        context_persona: data.context_persona?.trim() || null,
        context_icp: data.context_icp as unknown as Json,
        context_qualification: data.context_qualification as unknown as Json,
        context_faq: data.context_faq as unknown as Json,
        sdr_phone: data.sdr_phone?.trim() || null,
        sdr_availability: data.sdr_availability as unknown as Json,
      };

      const { error } = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", user.id);
      if (error) throw error;

      return { silent };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["agency-context"] });
      if (!result?.silent) {
        toast.success("Contexto da agência salvo com sucesso!");
      }
    },
    onError: (_error, variables) => {
      if (!variables?.silent) {
        toast.error("Erro ao salvar. Tente novamente.");
      }
    },
  });
};
