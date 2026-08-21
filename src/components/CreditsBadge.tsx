import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface CreditsBadgeProps {
  balance: number;
  className?: string;
}

const CreditsBadge = ({ balance, className }: CreditsBadgeProps) => (
  <div
    className={cn(
      "flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary",
      className
    )}
    aria-label={`${balance} créditos disponíveis`}
  >
    <Zap className="h-3.5 w-3.5" />
    <span>{balance}</span>
  </div>
);

export default CreditsBadge;
