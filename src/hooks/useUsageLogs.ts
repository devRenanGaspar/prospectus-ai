import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Database } from "@/integrations/supabase/types";

type UsageLogRow = Database["public"]["Tables"]["usage_logs"]["Row"];
type CompletionTable = "lead_searches" | "copy_requests" | "send_requests";

export interface UsageLog {
  id: string;
  action_name: string;
  cost: number;
  timestamp: string;
  lead_id: string | null;
  metadata: Record<string, unknown> | null;
  phone: string | null;
  completed_at: string | null;
}

const REQUEST_TABLE_BY_ACTION: Record<string, { table: CompletionTable; key: string }> = {
  FIND_LEAD: { table: "lead_searches", key: "search_id" },
  GENERATE_COPY: { table: "copy_requests", key: "copy_request_id" },
  SEND_MESSAGE: { table: "send_requests", key: "send_request_id" },
};

const enrichLogsWithCompletion = async (logs: UsageLogRow[]): Promise<UsageLog[]> => {
  const byTable: Partial<Record<CompletionTable, Set<string>>> = {};
  const logRequestId: (string | null)[] = logs.map((log) => {
    const cfg = REQUEST_TABLE_BY_ACTION[log.action_name];
    if (!cfg) return null;
    const meta = (log.metadata ?? {}) as Record<string, unknown>;
    const id = meta[cfg.key];
    if (typeof id !== "string") return null;
    byTable[cfg.table] = byTable[cfg.table] ?? new Set();
    byTable[cfg.table]!.add(id);
    return id;
  });

  const completionMaps: Partial<Record<CompletionTable, Map<string, string | null>>> = {};
  await Promise.all(
    (Object.entries(byTable) as [CompletionTable, Set<string>][]).map(async ([table, ids]) => {
      const { data, error } = await supabase
        .from(table)
        .select("id, completed_at")
        .in("id", Array.from(ids));
      if (error) return;
      const map = new Map<string, string | null>();
      (data ?? []).forEach((row) => map.set(row.id, row.completed_at ?? null));
      completionMaps[table] = map;
    })
  );

  return logs.map((log, idx) => {
    const cfg = REQUEST_TABLE_BY_ACTION[log.action_name];
    const reqId = logRequestId[idx];
    const completed = cfg && reqId ? completionMaps[cfg.table]?.get(reqId) ?? null : null;
    // `metadata` is `jsonb`, typed generically as `Json` by the generator;
    // the app's contract is that it always holds a plain object.
    return { ...log, completed_at: completed } as unknown as UsageLog;
  });
};

export const useUsageLogs = (
  filters?: { action?: string; from?: string; to?: string; page?: number; pageSize?: number },
  targetUserId?: string | null
) => {
  const { user } = useAuth();
  const page = filters?.page ?? 0;
  const pageSize = filters?.pageSize ?? 20;
  const effectiveUserId = targetUserId ?? user?.id;

  return useQuery({
    queryKey: ["usage-logs", effectiveUserId, filters],
    queryFn: async () => {
      if (!user) throw new Error("Não autenticado");
      if (!effectiveUserId) throw new Error("Usuário inválido");

      let query = supabase
        .from("usage_logs")
        .select("*", { count: "exact" })
        .eq("user_id", effectiveUserId)
        .order("timestamp", { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (filters?.action) {
        query = query.eq("action_name", filters.action);
      }
      if (filters?.from) {
        query = query.gte("timestamp", filters.from);
      }
      if (filters?.to) {
        query = query.lte("timestamp", filters.to);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      const logs = await enrichLogsWithCompletion(data ?? []);
      return { logs, total: count ?? 0 };
    },
    enabled: !!user,
  });
};

export const useUsageSummary = (targetUserId?: string | null) => {
  const { user } = useAuth();
  const effectiveUserId = targetUserId ?? user?.id;
  return useQuery({
    queryKey: ["usage-summary", effectiveUserId],
    queryFn: async () => {
      if (!user) throw new Error("Não autenticado");
      if (!effectiveUserId) throw new Error("Usuário inválido");
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const { data, error } = await supabase
        .from("usage_logs")
        .select("action_name, cost")
        .eq("user_id", effectiveUserId)
        .gte("timestamp", monthStart);
      if (error) throw error;

      const totalConsumed = (data ?? []).reduce((sum, l) => sum + l.cost, 0);
      const byAction: Record<string, number> = {};
      (data ?? []).forEach((l) => {
        byAction[l.action_name] = (byAction[l.action_name] ?? 0) + l.cost;
      });

      const topActions = Object.entries(byAction)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, cost]) => ({ name, cost }));

      return { totalConsumed, topActions };
    },
    enabled: !!user,
  });
};
