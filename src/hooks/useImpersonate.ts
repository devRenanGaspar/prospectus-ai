import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const IMPERSONATION_KEY = "impersonation";

export interface ImpersonationState {
  target_id: string;
  target_name: string;
  target_email: string;
  started_at: string;
}

export const useImpersonate = () => {
  return useMutation({
    mutationFn: async (target_user_id: string) => {
      const { data, error } = await supabase.functions.invoke("admin-impersonate", {
        body: {
          target_user_id,
          redirect_to: `${window.location.origin}/dashboard`,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { action_link: string; target: { id: string; full_name: string; email: string } };
    },
    onSuccess: async (data) => {
      const state: ImpersonationState = {
        target_id: data.target.id,
        target_name: data.target.full_name || data.target.email,
        target_email: data.target.email,
        started_at: new Date().toISOString(),
      };
      sessionStorage.setItem(IMPERSONATION_KEY, JSON.stringify(state));
      await supabase.auth.signOut();
      window.location.href = data.action_link;
    },
    onError: (e: Error) => {
      toast.error(`Erro: ${e.message || "não foi possível impersonificar"}`);
    },
  });
};
