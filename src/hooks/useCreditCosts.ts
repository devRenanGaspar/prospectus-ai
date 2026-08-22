import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * What each billable action costs right now, straight from `credit_costs`.
 *
 * The table is the pricing authority: `deduct_credits` reads it per charge and
 * admins edit it from Admin > Custos. Anything in the UI that quotes a price
 * has to read it too. Hardcoding was how the bulk-move bar came to promise
 * "custa 2 créditos" for a copy generation the system charges 3 for -- a
 * number that was right when it was typed and silently wrong after the first
 * price change.
 *
 * Readable by any active authenticated user (RLS policy "Authenticated users
 * can read costs"), so no admin path and no edge function is involved.
 */
export const useCreditCosts = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["credit-costs"],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase.from("credit_costs").select("action_name, cost");
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((row) => [row.action_name, row.cost]));
    },
    enabled: !!user,
    // Prices change from an admin screen, not from user activity. An hour of
    // staleness costs nothing and keeps this off the board's render path.
    staleTime: 60 * 60 * 1000,
  });
};
