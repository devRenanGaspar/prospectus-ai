import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Wifi, WifiOff, Clock, ArrowRightLeft } from "lucide-react";

interface Props {
  userId: string;
}

interface Event {
  id: string;
  event_type: "connected" | "disconnected" | "pending" | "number_changed";
  phone: string | null;
  previous_phone: string | null;
  previous_status: string | null;
  new_status: string | null;
  created_at: string;
}

const ICON = {
  connected: { Icon: Wifi, color: "text-green-500", label: "Conectado" },
  disconnected: { Icon: WifiOff, color: "text-red-500", label: "Desconectado" },
  pending: { Icon: Clock, color: "text-amber-500", label: "Pendente" },
  number_changed: { Icon: ArrowRightLeft, color: "text-blue-500", label: "Trocou número" },
};

const WhatsAppHistory = ({ userId }: Props) => {
  const { data, isLoading } = useQuery({
    queryKey: ["wa-events", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_connection_events")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as Event[];
    },
    enabled: !!userId,
  });

  if (isLoading) return <div className="space-y-2">{[0,1,2].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>;

  if (!data || data.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-4">Nenhum evento registrado.</p>;
  }

  return (
    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
      {data.map((ev) => {
        const meta = ICON[ev.event_type] ?? ICON.disconnected;
        const { Icon } = meta;
        return (
          <div key={ev.id} className="flex items-center gap-3 rounded-md border border-border/50 px-3 py-2 text-sm">
            <Icon className={`h-4 w-4 shrink-0 ${meta.color}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium">{meta.label}</span>
                {ev.event_type === "number_changed" && ev.previous_phone && (
                  <Badge variant="outline" className="text-xs font-mono">
                    {ev.previous_phone} → {ev.phone}
                  </Badge>
                )}
                {ev.event_type !== "number_changed" && ev.phone && (
                  <span className="text-xs font-mono text-muted-foreground truncate">{ev.phone}</span>
                )}
              </div>
            </div>
            <span className="text-xs text-muted-foreground shrink-0">
              {format(new Date(ev.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default WhatsAppHistory;
