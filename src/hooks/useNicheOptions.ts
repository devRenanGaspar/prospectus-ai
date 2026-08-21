import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface NicheOption {
  id: string;
  name: string;
}

export const useNicheOptions = () => {
  return useQuery({
    queryKey: ["niche-options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("niche_options")
        .select("id, name")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (error) throw error;
      return (data ?? []) as NicheOption[];
    },
    staleTime: 5 * 60 * 1000,
  });
};
