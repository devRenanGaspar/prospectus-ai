import { Building2, Clock, Globe, Phone, MapPin, ArrowRight, Loader, MessageCircle, Check, X, Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import type { Lead } from "@/hooks/useLeads";
import { LEAD_ACTION_HINTS, type LeadStatus } from "@/lib/constants";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

const iconMap: Record<string, React.ElementType> = {
  ArrowRight, Loader, Clock, MessageCircle, Check, X,
};

interface LeadCardProps {
  lead: Lead;
  isDragging?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}

const LeadCard = ({ lead, isDragging, selectable, selected, onToggleSelect }: LeadCardProps) => {
  const navigate = useNavigate();
  const lastActivity = lead.last_message_at || lead.updated_at;
  const hint = LEAD_ACTION_HINTS[lead.status as LeadStatus];
  const HintIcon = hint ? iconMap[hint.icon] : null;

  const handleClick = () => {
    if (selectable) {
      onToggleSelect?.();
    } else {
      navigate(`/leads/${lead.id}`);
    }
  };

  return (
    <Card
      className={`p-3 cursor-pointer border-border/50 bg-card hover:bg-secondary/30 transition-all duration-200 ${
        isDragging ? "shadow-elegant ring-2 ring-primary/30 rotate-2 scale-105" : ""
      } ${selected ? "ring-2 ring-primary border-primary/50 bg-primary/5" : ""}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          if (selectable) onToggleSelect?.();
          else navigate(`/leads/${lead.id}`);
        }
      }}
    >
      <div className="flex gap-2">
        {selectable && (
          <div
            className="pt-0.5"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect?.();
            }}
          >
            <Checkbox checked={selected} aria-label="Selecionar lead" />
          </div>
        )}
        <div className="space-y-2 flex-1 min-w-0">
          <p className="text-sm font-medium leading-tight truncate">{lead.name}</p>

          {lead.company_name && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Building2 className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{lead.company_name}</span>
            </div>
          )}

          {(lead.phone || lead.city) && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground overflow-hidden">
              {lead.phone && (
                <div className="flex items-center gap-1 min-w-0">
                  <Phone className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">{lead.phone}</span>
                </div>
              )}
              {lead.city && (
                <div className="flex items-center gap-1 min-w-0">
                  <MapPin className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">{lead.city}</span>
                </div>
              )}
            </div>
          )}

          {lead.total_score && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Star className="h-3 w-3 flex-shrink-0 fill-amber-400 text-amber-400" />
              <span className="truncate">
                {lead.total_score} ({lead.reviews_count || 0})
              </span>
            </div>
          )}

          {hint && HintIcon && (
            <div className={`flex items-center gap-1 text-[10px] font-medium ${hint.color}`}>
              <HintIcon className={`h-3 w-3 flex-shrink-0 ${hint.pulse ? "animate-pulse" : ""}`} />
              <span>{hint.label}</span>
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-muted-foreground/60 overflow-hidden">
            {lead.source && (
              <div className="flex items-center gap-1">
                <Globe className="h-3 w-3" />
                <span>{lead.source}</span>
              </div>
            )}
            <div className="flex items-center gap-1 ml-auto flex-shrink-0">
              <Clock className="h-3 w-3 flex-shrink-0" />
              <span className="whitespace-nowrap">
                {formatDistanceToNow(new Date(lastActivity), { addSuffix: true, locale: ptBR })}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default LeadCard;
