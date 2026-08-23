import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface LeadComment {
  id: string;
  lead_id: string;
  author_name: string;
  commented_at: string;
  content: string;
  rating: number | null;
  created_at: string;
}

export const useLeadComments = (leadId: string | undefined) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["lead_comments", leadId],
    queryFn: async () => {
      if (!leadId) return [];
      const { data, error } = await supabase
        .from("lead_comments")
        .select("*")
        .eq("lead_id", leadId)
        .order("commented_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LeadComment[];
    },
    enabled: !!user && !!leadId,
  });
};

export const useAddLeadComment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      leadId,
      authorName,
      content,
      commentedAt,
      rating,
    }: {
      leadId: string;
      authorName: string;
      content: string;
      commentedAt?: string;
      rating?: number;
    }) => {
      const { error } = await supabase.from("lead_comments").insert({
        lead_id: leadId,
        author_name: authorName,
        content: content.trim(),
        commented_at: commentedAt ?? "",
        ...(rating ? { rating } : {}),
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["lead_comments", vars.leadId] });
      toast.success("Comentário adicionado!");
    },
    onError: () => {
      toast.error("Erro ao adicionar comentário.");
    },
  });
};
