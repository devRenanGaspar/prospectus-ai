import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useEffect } from "react";
import type { Lead } from "./useLeads";

export interface Message {
  id: string;
  lead_id: string;
  content: string;
  sender: string;
  timestamp: string;
  external_message_id: string | null;
}

export const useLeadDetail = (leadId: string | undefined) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["lead", leadId],
    queryFn: async () => {
      if (!leadId) throw new Error("Lead ID obrigatório");
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("id", leadId)
        .single();
      if (error) throw error;
      return data as unknown as Lead;
    },
    enabled: !!user && !!leadId,
  });
};

export const useLeadMessages = (leadId: string | undefined) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["messages", leadId],
    queryFn: async () => {
      if (!leadId) return [];
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("lead_id", leadId)
        .order("timestamp", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Message[];
    },
    enabled: !!user && !!leadId,
  });

  // Realtime for messages
  useEffect(() => {
    if (!leadId) return;
    const channel = supabase
      .channel(`messages-${leadId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `lead_id=eq.${leadId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["messages", leadId] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [leadId, queryClient]);

  return query;
};

export const useSendMessage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ leadId, content, sender, userPhone, leadNumber }: { leadId: string; content: string; sender: string; userPhone?: string; leadNumber?: string }) => {
      if (!user) throw new Error("Não autenticado");
      const { error } = await supabase.from("messages").insert({
        lead_id: leadId,
        content: content.trim(),
        sender,
      });
      if (error) throw error;

      // Update last_message_at
      await supabase.from("leads").update({ last_message_at: new Date().toISOString() }).eq("id", leadId);

      // Fire-and-forget: forward to webhook. invoke() *resolves*
      // { data: null, error } for HTTP, relay and network failures rather than
      // rejecting, so the `.catch()`-only handler that used to be here never
      // ran for the failures that actually happen -- the message showed as
      // sent and was never delivered.
      //
      // The row inserted above is deliberately kept: the user wrote that text,
      // and deleting it to "undo" would lose it. `messages` has no delivery
      // status column, so the honest thing this can do is say it did not go
      // out. Tracking delivery per message is a schema change and a product
      // feature, recorded as a known gap rather than smuggled in here.
      const reportUndelivered = (reason: unknown) => {
        console.error("Webhook message_sent failed:", reason);
        toast.error("Mensagem salva, mas não entregue ao WhatsApp. Tente reenviar.");
      };
      supabase.functions
        .invoke("webhook-proxy", {
          body: {
            type: "message_sent",
            action: "send",
            payload: {
              user_phone: userPhone || null,
              lead_id: leadId,
              lead_number: leadNumber || null,
              sdr_name: (await supabase.from("profiles").select("sdr_name").eq("id", user.id).single()).data?.sdr_name || "MarIA",
              message: content.trim(),
            },
          },
        })
        .then(({ error: webhookError }) => {
          if (webhookError) reportUndelivered(webhookError);
        })
        .catch(reportUndelivered);
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["messages", vars.leadId] });
      queryClient.invalidateQueries({ queryKey: ["lead", vars.leadId] });
    },
    onError: () => {
      toast.error("Erro ao enviar mensagem.");
    },
  });
};

export const useUpdateLeadCopy = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ leadId, copy }: { leadId: string; copy: string }) => {
      const { error } = await supabase
        .from("leads")
        .update({ mensagem_abordagem_comercial: copy.trim(), updated_at: new Date().toISOString() })
        .eq("id", leadId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["lead", vars.leadId] });
      toast.success("Copy atualizada com sucesso!");
    },
    onError: () => {
      toast.error("Erro ao atualizar copy.");
    },
  });
};

export const useToggleAgent = () => {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ lead }: { lead: Lead }) => {
      if (!user) throw new Error("Não autenticado");
      const newValue = !lead.ai_agent_enabled;
      const { error } = await supabase
        .from("leads")
        .update({ ai_agent_enabled: newValue, updated_at: new Date().toISOString() })
        .eq("id", lead.id);
      if (error) throw error;

      // Fire-and-forget webhook. Same resolved-error handling as the send path
      // above: a `.catch()` alone never fires for HTTP/relay/network failures.
      //
      // Here the compensation *is* a revert, unlike the message path. The
      // toggle exists solely to tell n8n whether the agent answers this lead;
      // if n8n never learned, the value committed above is a lie, and the row
      // is the only thing claiming otherwise.
      const revertToggle = async (reason: unknown) => {
        console.error("Webhook agent_toggle failed:", reason);
        await supabase
          .from("leads")
          .update({ ai_agent_enabled: lead.ai_agent_enabled, updated_at: new Date().toISOString() })
          .eq("id", lead.id);
        queryClient.invalidateQueries({ queryKey: ["lead", lead.id] });
        queryClient.invalidateQueries({ queryKey: ["leads"] });
        toast.error("Não foi possível avisar o agente. A alteração foi desfeita.");
      };
      supabase.functions
        .invoke("webhook-proxy", {
          body: {
            type: "agent_toggle",
            action: newValue ? "on" : "off",
            payload: {
              user_id: user.id,
              lead_id: lead.id,
              user_phone: profile?.whatsapp_number || profile?.sdr_phone || null,
              lead_phone: lead.phone || null,
            },
          },
        })
        .then(({ error: webhookError }) => {
          if (webhookError) return revertToggle(webhookError);
        })
        .catch(revertToggle);

      return newValue;
    },
    onSuccess: (newValue, { lead }) => {
      queryClient.invalidateQueries({ queryKey: ["lead", lead.id] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success(newValue ? "Agente IA ligado" : "Agente IA desligado");
    },
    onError: () => {
      toast.error("Erro ao alternar agente IA.");
    },
  });
};
