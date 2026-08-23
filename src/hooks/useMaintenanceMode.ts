import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type MaintenanceMode = "off" | "banner" | "blocked";

export interface MaintenanceState {
  mode: MaintenanceMode;
  message: string | null;
  startedAt: string | null;
}

const QUERY_KEY = ["app-settings", "maintenance"];

export const useMaintenanceMode = () => {
  const queryClient = useQueryClient();

  const query = useQuery<MaintenanceState>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("maintenance_mode, maintenance_message, maintenance_started_at")
        .eq("id", true)
        .maybeSingle();

      if (error) throw error;

      return {
        mode: (data?.maintenance_mode ?? "off") as MaintenanceMode,
        message: data?.maintenance_message ?? null,
        startedAt: data?.maintenance_started_at ?? null,
      };
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("app-settings-maintenance")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_settings" },
        () => {
          queryClient.invalidateQueries({ queryKey: QUERY_KEY });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
};
