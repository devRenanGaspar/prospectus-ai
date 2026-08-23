import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Plan {
  id: string;
  name: string;
  price_monthly: number;
  credits_included: number;
  features: string[] | null;
  is_active: boolean | null;
  payment_link: string | null;
  created_at: string;
}

export interface CreditPackage {
  id: string;
  credits: number;
  price: number;
  payment_link: string | null;
  is_active: boolean;
  created_at: string;
}

export const usePlans = () => {
  return useQuery({
    queryKey: ["plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans")
        .select("*")
        .order("price_monthly", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((p) => ({
        ...p,
        features: Array.isArray(p.features) ? (p.features as string[]) : [],
      })) as Plan[];
    },
  });
};

export const useCreditPackages = () =>
  useQuery({
    queryKey: ["credit-packages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_packages")
        .select("*")
        .eq("is_active", true)
        .order("credits", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CreditPackage[];
    },
  });

export const useCurrentSubscription = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["subscription", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*, plans(*)")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
};
