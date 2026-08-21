import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

// ---- Admin Users ----
export const useAdminUsers = () =>
  useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*, plans(name), subscriptions(status, current_period_start, current_period_end)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

export type AdminUserRow = NonNullable<ReturnType<typeof useAdminUsers>["data"]>[number];

export const useUpdateUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { id: string; role?: string; credits_balance?: number; plan_id?: string | null; full_name?: string; email?: string; sdr_phone?: string }) => {
      const { error } = await supabase.rpc("admin_update_user_profile", {
        _id: payload.id,
        _role: payload.role ?? undefined,
        _credits_balance: payload.credits_balance ?? undefined,
        _plan_id: payload.plan_id ?? undefined,
        _clear_plan: payload.plan_id === null,
        _full_name: payload.full_name ?? undefined,
        _email: payload.email ?? undefined,
        _sdr_phone: payload.sdr_phone ?? undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); toast.success("Usuário atualizado!"); },
    onError: () => toast.error("Erro ao atualizar usuário."),
  });
};

// ---- Admin Plans ----
export const useAdminPlans = () =>
  useQuery({
    queryKey: ["admin-plans"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plans").select("*").order("price_monthly");
      if (error) throw error;
      return data ?? [];
    },
  });

export const useUpsertPlan = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (plan: { id?: string; name: string; price_monthly: number; credits_included: number; features: string[]; is_active: boolean; payment_link?: string }) => {
      const payload = { ...plan, features: plan.features as unknown as Json, payment_link: plan.payment_link || null };
      if (plan.id) {
        const { error } = await supabase.from("plans").update(payload).eq("id", plan.id);
        if (error) throw error;
      } else {
        const { id: _id, ...rest } = payload;
        const { error } = await supabase.from("plans").insert(rest);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-plans"] }); qc.invalidateQueries({ queryKey: ["plans"] }); toast.success("Plano salvo!"); },
    onError: () => toast.error("Erro ao salvar plano."),
  });
};

// ---- Admin Credit Packages ----
export const useAdminCreditPackages = () =>
  useQuery({
    queryKey: ["admin-credit-packages"],
    queryFn: async () => {
      const { data, error } = await supabase.from("credit_packages").select("*").order("credits");
      if (error) throw error;
      return data ?? [];
    },
  });

export const useUpsertCreditPackage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pkg: { id?: string; credits: number; price: number; payment_link?: string; is_active: boolean }) => {
      const payload = { credits: pkg.credits, price: pkg.price, payment_link: pkg.payment_link || null, is_active: pkg.is_active };
      if (pkg.id) {
        const { error } = await supabase.from("credit_packages").update(payload).eq("id", pkg.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("credit_packages").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-credit-packages"] }); qc.invalidateQueries({ queryKey: ["credit-packages"] }); toast.success("Pacote salvo!"); },
    onError: () => toast.error("Erro ao salvar pacote."),
  });
};

// ---- Admin Costs ----
export const useAdminCosts = () =>
  useQuery({
    queryKey: ["admin-costs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("credit_costs").select("*").order("action_name");
      if (error) throw error;
      return data ?? [];
    },
  });

export const useUpsertCost = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cost: { id?: string; action_name: string; cost: number }) => {
      if (cost.id) {
        const { error } = await supabase.from("credit_costs").update({ action_name: cost.action_name, cost: cost.cost }).eq("id", cost.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("credit_costs").insert({ action_name: cost.action_name, cost: cost.cost });
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-costs"] }); toast.success("Custo salvo!"); },
    onError: () => toast.error("Erro ao salvar custo."),
  });
};

// ---- Admin Update Password ----
export const useUpdateUserPassword = () => {
  return useMutation({
    mutationFn: async (payload: { user_id: string; new_password: string }) => {
      const { data, error } = await supabase.functions.invoke("admin-update-password", {
        body: payload,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => toast.success("Senha atualizada!"),
    onError: (e: Error) => toast.error(`Erro ao atualizar senha: ${e.message}`),
  });
};

// ---- Admin Lead Pool ----
export const useAdminLeadPool = () =>
  useQuery({
    queryKey: ["admin-lead-pool"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_lead_pool_summary');
      if (error) throw error;
      const rows = (data as unknown as { category: string; count: number }[]) ?? [];

      const { data: niches, error: nichesError } = await supabase
        .from("niche_options")
        .select("name, lead_category");
      if (nichesError) throw nichesError;

      const nicheMap = new Map<string, string>();
      (niches ?? []).forEach((n) => {
        if (n.lead_category) nicheMap.set(n.lead_category, n.name);
      });

      return rows.map((r) => ({
        ...r,
        niche_name: nicheMap.get(r.category) ?? null,
      }));
    },
  });

export const useDeleteCost = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("credit_costs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-costs"] }); toast.success("Custo removido!"); },
    onError: () => toast.error("Erro ao remover custo."),
  });
};

// ---- Admin User Stats ----
const SENT_OR_BEYOND = ["SENT", "IN_CONVERSATION", "FOLLOW_UP", "SCHEDULED", "CLOSED_WON", "CLOSED_LOST"];
const RESPONDED = ["IN_CONVERSATION", "FOLLOW_UP", "SCHEDULED", "CLOSED_WON", "CLOSED_LOST"];

export const useAdminUserStats = (userId: string | null) =>
  useQuery({
    queryKey: ["admin-user-stats", userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) throw new Error("No userId");

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const cutoff = thirtyDaysAgo.toISOString();

      // Fetch all leads for this user
      const { data: leads, error: leadsErr } = await supabase
        .from("leads")
        .select("id, status, created_at")
        .eq("user_id", userId);
      if (leadsErr) throw leadsErr;
      const all = leads ?? [];

      // Fetch message counts for this user's leads
      const leadIds = all.map((l) => l.id);
      let messagesAll = 0;
      let messages30d = 0;

      if (leadIds.length > 0) {
        // Batch in chunks of 100 to avoid query limits
        for (let i = 0; i < leadIds.length; i += 100) {
          const chunk = leadIds.slice(i, i + 100);

          const { count: countAll, error: e1 } = await supabase
            .from("messages")
            .select("*", { count: "exact", head: true })
            .in("lead_id", chunk);
          if (e1) throw e1;
          messagesAll += countAll ?? 0;

          const { count: count30d, error: e2 } = await supabase
            .from("messages")
            .select("*", { count: "exact", head: true })
            .in("lead_id", chunk)
            .gte("timestamp", cutoff);
          if (e2) throw e2;
          messages30d += count30d ?? 0;
        }
      }

      const all30d = all.filter((l) => l.created_at >= cutoff);

      return {
        leadsFound: { total: all.length, last30: all30d.length },
        messagesSent: {
          total: all.filter((l) => SENT_OR_BEYOND.includes(l.status)).length,
          last30: all30d.filter((l) => SENT_OR_BEYOND.includes(l.status)).length,
        },
        responses: {
          total: all.filter((l) => RESPONDED.includes(l.status)).length,
          last30: all30d.filter((l) => RESPONDED.includes(l.status)).length,
        },
        messagesExchanged: { total: messagesAll, last30: messages30d },
      };
    },
  });
