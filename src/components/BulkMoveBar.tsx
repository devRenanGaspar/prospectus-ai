import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KANBAN_COLUMNS, LEAD_STATUS_LABELS, type LeadStatus } from "@/lib/constants";
import { useCreditCosts } from "@/hooks/useCreditCosts";
import { X } from "lucide-react";
import { useState } from "react";

interface BulkMoveBarProps {
  count: number;
  currentColumn: LeadStatus;
  onMove: (target: LeadStatus) => void;
  onCancel: () => void;
  isMoving?: boolean;
}

/**
 * Which priced action each destination column triggers.
 *
 * The per-unit price is NOT here. It used to be -- COPY_PENDING quoted `n * 2`
 * while `credit_costs.GENERATE_COPY` had been 3 for a long time, so the bar
 * under-quoted every bulk copy generation by a third. A price written into a
 * component is correct exactly until someone changes it in Admin > Custos, and
 * nothing connects the two. Reading the table is the only version that stays
 * true.
 */
const COST_ACTION: Partial<Record<LeadStatus, string>> = {
  COPY_PENDING: "GENERATE_COPY",
  SEND_PENDING: "SEND_MESSAGE",
};

const BulkMoveBar = ({ count, currentColumn, onMove, onCancel, isMoving }: BulkMoveBarProps) => {
  const [target, setTarget] = useState<LeadStatus | "">("");
  const availableTargets = KANBAN_COLUMNS.filter((s) => s !== currentColumn);
  const { data: costs } = useCreditCosts();

  // No hint until the real price is known. A missing hint is a smaller lie
  // than a stale one, and the query resolves in the time it takes to open the
  // dropdown.
  const costHint = (status: LeadStatus): string => {
    const action = COST_ACTION[status];
    const unit = action ? costs?.[action] : undefined;
    if (unit === undefined) return "";
    const total = unit * count;
    return ` (custa ${total} crédito${total > 1 ? "s" : ""})`;
  };

  const handleConfirm = () => {
    if (!target) return;
    onMove(target as LeadStatus);
    setTarget("");
  };

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-200">
      <div className="flex items-center gap-3 bg-card border border-border shadow-elegant rounded-lg px-4 py-3">
        <span className="text-sm font-medium whitespace-nowrap">
          {count} selecionado{count > 1 ? "s" : ""}
          <span className="text-muted-foreground font-normal"> em {LEAD_STATUS_LABELS[currentColumn]}</span>
        </span>

        <Select value={target} onValueChange={(v) => setTarget(v as LeadStatus)}>
          <SelectTrigger className="h-9 w-[220px]">
            <SelectValue placeholder="Mover para..." />
          </SelectTrigger>
          <SelectContent>
            {availableTargets.map((s) => {
              const hint = costHint(s);
              return (
                <SelectItem key={s} value={s}>
                  {LEAD_STATUS_LABELS[s]}
                  {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        <Button size="sm" onClick={handleConfirm} disabled={!target || isMoving}>
          Mover
        </Button>

        <Button size="sm" variant="ghost" onClick={onCancel} aria-label="Cancelar seleção">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default BulkMoveBar;
