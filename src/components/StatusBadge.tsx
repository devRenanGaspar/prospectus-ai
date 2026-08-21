import { Badge } from "@/components/ui/badge";
import { LEAD_STATUS_LABELS, LEAD_STATUS_COLORS, type LeadStatus } from "@/lib/constants";

interface StatusBadgeProps {
  status: LeadStatus;
}

const StatusBadge = ({ status }: StatusBadgeProps) => (
  <Badge variant={LEAD_STATUS_COLORS[status]}>
    {LEAD_STATUS_LABELS[status]}
  </Badge>
);

export default StatusBadge;
