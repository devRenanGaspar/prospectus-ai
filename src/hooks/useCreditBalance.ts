import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const useCreditBalance = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["credit-balance", user?.id],
    queryFn: async () => {
      if (!user) throw new Error("Não autenticado");
      const { data, error } = await supabase
        .from("profiles")
        .select("credits_balance")
        .eq("id", user.id)
        .single();
      if (error) throw error;
      return data.credits_balance;
    },
    enabled: !!user,
    refetchInterval: 30000,
  });
};
