import type { BadgeProps } from "@/components/ui/badge";

export const LEAD_STATUS = {
  NEW: "NEW",
  COPY_PENDING: "COPY_PENDING",
  COPY_READY: "COPY_READY",
  SEND_PENDING: "SEND_PENDING",
  SENT: "SENT",
  IN_CONVERSATION: "IN_CONVERSATION",
  FOLLOW_UP: "FOLLOW_UP",
  SCHEDULED: "SCHEDULED",
  CLOSED_WON: "CLOSED_WON",
  CLOSED_LOST: "CLOSED_LOST",
} as const;

export type LeadStatus = (typeof LEAD_STATUS)[keyof typeof LEAD_STATUS];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: "Novo",
  COPY_PENDING: "Preparar Copy",
  COPY_READY: "Copy Pronta",
  SEND_PENDING: "Enviar Mensagem",
  SENT: "Enviado",
  IN_CONVERSATION: "Em Conversa",
  FOLLOW_UP: "Follow-up",
  SCHEDULED: "Agendado",
  CLOSED_WON: "Ganho",
  CLOSED_LOST: "Perdido",
};

export const LEAD_STATUS_COLORS: Record<LeadStatus, NonNullable<BadgeProps["variant"]>> = {
  NEW: "default",
  COPY_PENDING: "warning",
  COPY_READY: "accent",
  SEND_PENDING: "warning",
  SENT: "secondary",
  IN_CONVERSATION: "default",
  FOLLOW_UP: "warning",
  SCHEDULED: "accent",
  CLOSED_WON: "success",
  CLOSED_LOST: "destructive",
};

// FOLLOW_UP exists in LEAD_STATUS and n8n moves leads there; without the
// column, those leads were invisible on the board (5 leads in production).
export const KANBAN_COLUMNS: LeadStatus[] = [
  "NEW",
  "COPY_PENDING",
  "COPY_READY",
  "SEND_PENDING",
  "SENT",
  "IN_CONVERSATION",
  "FOLLOW_UP",
  "SCHEDULED",
  "CLOSED_WON",
  "CLOSED_LOST",
];

export const LEAD_STATUS_SUBTITLES: Record<LeadStatus, string> = {
  NEW: "Leads encontrados pelo sistema",
  COPY_PENDING: "Arraste aqui para gerar copy",
  COPY_READY: "Revise a copy e envie",
  SEND_PENDING: "Arraste aqui para enviar as mensagens",
  SENT: "Mensagem enviada",
  IN_CONVERSATION: "Lead respondeu, converse",
  FOLLOW_UP: "Faça o acompanhamento",
  SCHEDULED: "Reunião agendada",
  CLOSED_WON: "Deal fechado",
  CLOSED_LOST: "Não convertido",
};

export const LEAD_STATUS_ICONS: Record<LeadStatus, string> = {
  NEW: "Sparkles",
  COPY_PENDING: "Zap",
  COPY_READY: "User",
  SEND_PENDING: "Zap",
  SENT: "CheckCircle",
  IN_CONVERSATION: "User",
  FOLLOW_UP: "User",
  SCHEDULED: "User",
  CLOSED_WON: "Trophy",
  CLOSED_LOST: "XCircle",
};

export const LEAD_ACTION_HINTS: Record<LeadStatus, { label: string; icon: string; color: string; pulse?: boolean }> = {
  NEW: { label: "Mover →", icon: "ArrowRight", color: "text-muted-foreground" },
  COPY_PENDING: { label: "Processando...", icon: "Loader", color: "text-warning", pulse: true },
  COPY_READY: { label: "Mover →", icon: "ArrowRight", color: "text-muted-foreground" },
  SEND_PENDING: { label: "Enviando...", icon: "Loader", color: "text-warning", pulse: true },
  SENT: { label: "Aguardando resposta", icon: "Clock", color: "text-secondary-foreground" },
  IN_CONVERSATION: { label: "Em conversa", icon: "MessageCircle", color: "text-accent-foreground" },
  FOLLOW_UP: { label: "Fazer follow-up", icon: "ArrowRight", color: "text-warning" },
  SCHEDULED: { label: "Agendado ✓", icon: "Check", color: "text-success" },
  CLOSED_WON: { label: "Ganho ✓", icon: "Check", color: "text-success" },
  CLOSED_LOST: { label: "Perdido", icon: "X", color: "text-destructive" },
};

// BLOCKED existe no banco (profiles_role_check) e em is_active_user().
export type UserRole = "USER" | "ADMIN" | "BLOCKED";
