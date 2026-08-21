import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KANBAN_COLUMNS, LEAD_STATUS_LABELS, type LeadStatus } from "@/lib/constants";
import { X } from "lucide-react";
import { useState } from "react";

interface BulkMoveBarProps {
  count: number;
  currentColumn: LeadStatus;
  onMove: (target: LeadStatus) => void;
  onCancel: () => void;
  isMoving?: boolean;
}

const COST_HINT: Partial<Record<LeadStatus, (n: number) => string>> = {
  COPY_PENDING: (n) => ` (custa ${n * 2} créditos)`,
  SEND_PENDING: (n) => ` (custa ${n} crédito${n > 1 ? "s" : ""})`,
};

const BulkMoveBar = ({ count, currentColumn, onMove, onCancel, isMoving }: BulkMoveBarProps) => {
  const [target, setTarget] = useState<LeadStatus | "">("");
  const availableTargets = KANBAN_COLUMNS.filter((s) => s !== currentColumn);

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
              const hint = COST_HINT[s]?.(count) ?? "";
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
