import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CopyQualitySnapshot } from "@/lib/copy-quality";

export const useAdminCopyQuality = () =>
  useQuery<CopyQualitySnapshot>({
    queryKey: ["admin-copy-quality"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_admin_copy_quality");
      if (error) throw error;
      return data as unknown as CopyQualitySnapshot;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
