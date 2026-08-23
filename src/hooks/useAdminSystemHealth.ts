import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { SystemHealthHistory, SystemHealthSnapshot } from "@/lib/system-health";

export const useAdminSystemHealth = () =>
  useQuery<SystemHealthSnapshot>({
    queryKey: ["admin-system-health"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_admin_system_health");
      if (error) throw error;
      return data as unknown as SystemHealthSnapshot;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

export const useAdminSystemHealthHistory = () =>
  useQuery<SystemHealthHistory>({
    queryKey: ["admin-system-health-history", 168],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_admin_system_health_history", { _hours: 168 });
      if (error) throw error;
      return data as unknown as SystemHealthHistory;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
