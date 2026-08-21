import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { startOfMonth, startOfWeek, subWeeks } from "date-fns";

export interface FunnelStep {
  name: string;
  value: number;
}

export interface DashboardMetrics {
  leadsThisMonth: number;
  responseRate: number;
  creditsBalance: number;
  funnelData: FunnelStep[];
  creditsUsage: { name: string; consumed: number }[];
  hasData: boolean;
}

const SENT_OR_BEYOND = ["SENT", "IN_CONVERSATION", "FOLLOW_UP", "SCHEDULED", "CLOSED_WON", "CLOSED_LOST"];
const RESPONDED = ["IN_CONVERSATION", "FOLLOW_UP", "SCHEDULED", "CLOSED_WON", "CLOSED_LOST"];
const MEETINGS = ["SCHEDULED", "CLOSED_WON"];

export const useDashboardMetrics = () => {
  const { user } = useAuth();

  return useQuery<DashboardMetrics>({
    queryKey: ["dashboard-metrics", user?.id],
    queryFn: async () => {
      if (!user) throw new Error("Não autenticado");

      const monthStart = startOfMonth(new Date()).toISOString();

      // Every query below reads `error` and throws. They used to discard it,
      // which meant `queryFn` never rejected, `isError` was never true, and
      // the Dashboard's <ErrorState> was unreachable code. An RLS denial or a
      // dropped connection rendered as "Nenhum dado ainda" with zeros --
      // worse than an error, because the user believes it.

      // Leads this month
      const { data: leadsMonth, error: leadsMonthError } = await supabase
        .from("leads")
        .select("id, status, created_at")
        .eq("user_id", user.id)
        .gte("created_at", monthStart);
      if (leadsMonthError) throw leadsMonthError;

      const leads = leadsMonth ?? [];
      const leadsThisMonth = leads.length;

      // Response rate
      const responded = leads.filter((l) => RESPONDED.includes(l.status)).length;
      const sentOrBeyond = leads.filter((l) => SENT_OR_BEYOND.includes(l.status)).length;
      const responseRate = sentOrBeyond > 0 ? Math.round((responded / sentOrBeyond) * 100) : 0;

      // Credits balance
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("credits_balance")
        .eq("id", user.id)
        .single();
      if (profileError) throw profileError;
      const creditsBalance = profileData?.credits_balance ?? 0;

      // Funnel data (all leads, not just this month)
      const { data: allLeads, error: allLeadsError } = await supabase
        .from("leads")
        .select("status")
        .eq("user_id", user.id);
      if (allLeadsError) throw allLeadsError;

      const all = allLeads ?? [];
      const totalLeads = all.length;
      const sent = all.filter((l) => SENT_OR_BEYOND.includes(l.status)).length;
      const responses = all.filter((l) => RESPONDED.includes(l.status)).length;
      const meetings = all.filter((l) => MEETINGS.includes(l.status)).length;
      const sales = all.filter((l) => l.status === "CLOSED_WON").length;

      const funnelData: FunnelStep[] = [
        { name: "Leads encontrados", value: totalLeads },
        { name: "Mensagens enviadas", value: sent },
        { name: "Respostas", value: responses },
        { name: "Reuniões agendadas", value: meetings },
        { name: "Vendas realizadas", value: sales },
      ];

      // Usage logs for credits chart
      const { data: usageLogs, error: usageLogsError } = await supabase
        .from("usage_logs")
        .select("cost, timestamp")
        .eq("user_id", user.id)
        .gte("timestamp", monthStart);
      if (usageLogsError) throw usageLogsError;

      // Credits usage by week (last 4 weeks)
      const creditsUsage: { name: string; consumed: number }[] = [];
      for (let i = 3; i >= 0; i--) {
        const weekStart = subWeeks(new Date(), i);
        const ws = startOfWeek(weekStart, { weekStartsOn: 1 }).toISOString();
        const we = startOfWeek(subWeeks(new Date(), i - 1), { weekStartsOn: 1 }).toISOString();
        const weekCost = (usageLogs ?? [])
          .filter((l) => l.timestamp >= ws && l.timestamp < we)
          .reduce((sum, l) => sum + l.cost, 0);
        creditsUsage.push({ name: `Sem ${4 - i}`, consumed: weekCost });
      }

      const totalCost = usageLogs?.reduce((sum, l) => sum + l.cost, 0) ?? 0;

      return {
        leadsThisMonth,
        responseRate,
        creditsBalance,
        funnelData,
        creditsUsage,
        hasData: leadsThisMonth > 0 || totalCost > 0 || totalLeads > 0,
      };
    },
    enabled: !!user,
    refetchInterval: 60000,
  });
};
