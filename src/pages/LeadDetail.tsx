import { useParams } from "react-router-dom";
import { useState, useRef, useEffect } from "react";
import { z } from "zod";
import SEO from "@/components/SEO";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import PageHeader from "@/components/PageHeader";
import LoadingState from "@/components/LoadingState";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import StatusBadge from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FileText, Building2, Clock, Send, User, Bot, MessageCircle,
  Pencil, Check, X, ArrowRight, Phone, MapPin, Star, Hash, Instagram,
  ExternalLink, Tag, Power,
} from "lucide-react";
import { useLeadDetail, useLeadMessages, useSendMessage, useUpdateLeadCopy, useToggleAgent } from "@/hooks/useLeadDetail";
import LeadComments from "@/components/LeadComments";
import { useUpdateLeadStatus } from "@/hooks/useLeads";
import { usePendingCopyRequest, useRequestCopy, copyRequestPendingKey, fetchPendingCopyRequest } from "@/hooks/useCopyRequest";
import { useRequestSend } from "@/hooks/useSendRequest";
import { useQueryClient } from "@tanstack/react-query";
import { KANBAN_COLUMNS, LEAD_STATUS_LABELS, type LeadStatus } from "@/lib/constants";
import { formatDistanceToNow, format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useWhatsApp } from "@/hooks/useWhatsApp";
import WhatsAppDisconnectedDialog from "@/components/WhatsAppDisconnectedDialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

const messageSchema = z.string().trim().min(1, "Mensagem não pode ser vazia").max(2000);
const copySchema = z.string().trim().min(1, "Copy não pode ser vazia").max(5000);

const LeadDetail = () => {
  const { leadId } = useParams();
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();
  const { data: lead, isLoading, isError, error: leadError, refetch } = useLeadDetail(leadId);
  const { data: messages = [], isLoading: msgLoading } = useLeadMessages(leadId);
  const sendMessage = useSendMessage();
  const updateCopy = useUpdateLeadCopy();
  const updateStatus = useUpdateLeadStatus();
  const toggleAgent = useToggleAgent();
  const requestCopy = useRequestCopy();
  const { data: pendingCopy } = usePendingCopyRequest();
  const requestSend = useRequestSend();
  const [newMessage, setNewMessage] = useState("");
  const [editingCopy, setEditingCopy] = useState(false);
  const [copyDraft, setCopyDraft] = useState("");
  const [showWhatsAppDisconnectedModal, setShowWhatsAppDisconnectedModal] = useState(false);
  const [showCopyLockModal, setShowCopyLockModal] = useState(false);
  
  const { verifyConnection } = useWhatsApp();
  const chatViewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const viewport = chatViewportRef.current;
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [messages]);

  if (isLoading) return <LoadingState variant="page" count={3} />;
  if (isError) {
    // PGRST116 = .single() matched zero rows: genuinely doesn't exist (or RLS
    // hides it, which reads the same to this user). Anything else is a real
    // fetch failure -- network, timeout -- where "does not exist" would be
    // actively misleading and "try again" is the honest answer.
    const notFound = (leadError as { code?: string } | null)?.code === "PGRST116";
    if (notFound) {
      return (
        <>
          <SEO title="Lead não encontrado" />
          <EmptyState icon={FileText} title="Lead não encontrado" description="Este lead não existe ou você não tem permissão." />
        </>
      );
    }
    return (
      <>
        <SEO title="Erro ao carregar lead" />
        <ErrorState
          title="Não foi possível carregar este lead"
          description="Houve uma falha ao buscar os dados. Tente novamente."
          onRetry={() => refetch()}
        />
      </>
    );
  }
  if (!lead) {
    return (
      <>
        <SEO title="Lead não encontrado" />
        <EmptyState icon={FileText} title="Lead não encontrado" description="Este lead não existe ou você não tem permissão." />
      </>
    );
  }

  const handleSend = async () => {
    const result = messageSchema.safeParse(newMessage);
    if (!result.success) {
      toast.error(result.error.errors[0].message);
      return;
    }
    const loadingId = toast.loading("Verificando conexão do WhatsApp...");
    const ok = await verifyConnection();
    toast.dismiss(loadingId);
    if (!ok) {
      setShowWhatsAppDisconnectedModal(true);
      return;
    }
    sendMessage.mutate(
      { leadId: lead.id, content: result.data, sender: "USER", userPhone: profile?.whatsapp_number || profile?.sdr_phone || undefined, leadNumber: lead.phone || undefined },
      { onSuccess: () => setNewMessage("") }
    );
  };

  const handleSaveCopy = () => {
    const result = copySchema.safeParse(copyDraft);
    if (!result.success) {
      toast.error(result.error.errors[0].message);
      return;
    }
    updateCopy.mutate({ leadId: lead.id, copy: result.data }, {
      onSuccess: () => setEditingCopy(false),
    });
  };

  const handleStatusChange = async (status: string) => {
    const target = status as LeadStatus;
    if (!lead) return;
    if (lead.status === target) return;

    // Copy generation flow (deducts credit, creates copy_requests, triggers N8N)
    if (target === "COPY_PENDING") {
      if (pendingCopy && user) {
        const fresh = await queryClient.fetchQuery({
          queryKey: copyRequestPendingKey(user.id),
          queryFn: () => fetchPendingCopyRequest(user.id),
        });
        if (fresh) {
          setShowCopyLockModal(true);
          return;
        }
      }
      requestCopy.mutate([lead.id]);
      return;
    }

    // Message-sending flow (checks WhatsApp, deducts credit, enqueues lead)
    if (target === "SEND_PENDING") {
      const loadingId = toast.loading("Verificando conexão do WhatsApp...");
      const ok = await verifyConnection();
      toast.dismiss(loadingId);
      if (!ok) {
        setShowWhatsAppDisconnectedModal(true);
        return;
      }
      requestSend.mutate([lead.id]);
      return;
    }

    updateStatus.mutate({ leadId: lead.id, status: target });
    toast.success(`Status atualizado para ${LEAD_STATUS_LABELS[target]}`);
  };

  // Group messages by date
  const groupedMessages: { label: string; msgs: typeof messages }[] = [];
  let currentLabel = "";
  messages.forEach((msg) => {
    const date = new Date(msg.timestamp);
    let label: string;
    if (isToday(date)) label = "Hoje";
    else if (isYesterday(date)) label = "Ontem";
    else label = format(date, "dd/MM/yyyy");
    if (label !== currentLabel) {
      currentLabel = label;
      groupedMessages.push({ label, msgs: [] });
    }
    groupedMessages[groupedMessages.length - 1].msgs.push(msg);
  });

  const senderIcon = (sender: string) => {
    if (sender === "USER") return <User className="h-3.5 w-3.5" />;
    if (sender === "AI") return <Bot className="h-3.5 w-3.5" />;
    return <MessageCircle className="h-3.5 w-3.5" />;
  };

  const senderLabel = (sender: string) => {
    if (sender === "USER") return profile?.full_name || "Você";
    if (sender === "AI") return "IA";
    return lead?.name || "Lead";
  };

  return (
    <>
      <SEO title={`Lead: ${lead.name}`} description={`Detalhes e mensagens do lead ${lead.name}`} />
      <PageHeader
        title={lead.name}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Leads", href: "/leads/board" },
          { label: lead.name },
        ]}
        actions={
          <Select value={lead.status} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KANBAN_COLUMNS.map((s) => (
                <SelectItem key={s} value={s}>{LEAD_STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <TooltipProvider>
      <div className="grid gap-6 lg:grid-cols-3 animate-fade-in">
        {/* Lead info */}
        <div className="space-y-4">
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Informações</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <span className="text-muted-foreground shrink-0">Status</span>
                <StatusBadge status={lead.status as LeadStatus} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground flex items-center gap-1.5 shrink-0">
                  <Power className="h-3.5 w-3.5" /> Agente IA
                </span>
                <Button
                  variant={lead.ai_agent_enabled ? "default" : "outline"}
                  size="sm"
                  className={`h-7 text-xs gap-1.5 ${lead.ai_agent_enabled ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}`}
                  onClick={() => toggleAgent.mutate({ lead })}
                  disabled={toggleAgent.isPending}
                >
                  <span className={`h-2 w-2 rounded-full ${lead.ai_agent_enabled ? "bg-white" : "bg-muted-foreground"}`} />
                  {lead.ai_agent_enabled ? "Ligado" : "Desligado"}
                </Button>
              </div>
              {lead.company_name && (
                <div className="flex items-start justify-between gap-3 min-w-0">
                  <span className="text-muted-foreground flex items-center gap-1.5 shrink-0"><Building2 className="h-3.5 w-3.5" /> Empresa</span>
                  <span className="text-right min-w-0 break-words">{lead.company_name}</span>
                </div>
              )}
              <div className="flex items-start justify-between gap-3">
                <span className="text-muted-foreground flex items-center gap-1.5 shrink-0"><Clock className="h-3.5 w-3.5" /> Criado em</span>
                <span>{format(new Date(lead.created_at), "dd/MM/yyyy", { locale: ptBR })}</span>
              </div>
              {lead.last_message_at && (
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground shrink-0">Última mensagem</span>
                  <span className="text-right">{formatDistanceToNow(new Date(lead.last_message_at), { addSuffix: true, locale: ptBR })}</span>
                </div>
              )}
              {lead.phone && (
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground flex items-center gap-1.5 shrink-0"><Phone className="h-3.5 w-3.5" /> Telefone</span>
                  <span>{lead.phone}</span>
                </div>
              )}
              {lead.city && (
                <div className="flex items-start justify-between gap-3 min-w-0">
                  <span className="text-muted-foreground flex items-center gap-1.5 shrink-0"><MapPin className="h-3.5 w-3.5" /> Cidade</span>
                  <span className="text-right min-w-0 break-words">{lead.city}{lead.neighborhood ? ` - ${lead.neighborhood}` : ""}</span>
                </div>
              )}
              {lead.cnpj && (
                <div className="flex items-start justify-between gap-3 min-w-0">
                  <span className="text-muted-foreground flex items-center gap-1.5 shrink-0"><Hash className="h-3.5 w-3.5" /> CNPJ</span>
                  <span className="text-right min-w-0 break-words">{lead.cnpj}</span>
                </div>
              )}
              {lead.instagram && (
                <div className="flex items-start justify-between gap-3 min-w-0">
                  <span className="text-muted-foreground flex items-center gap-1.5 shrink-0"><Instagram className="h-3.5 w-3.5" /> Instagram</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <a href={`https://instagram.com/${lead.instagram.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-right min-w-0 truncate">{lead.instagram}</a>
                    </TooltipTrigger>
                    <TooltipContent>{lead.instagram}</TooltipContent>
                  </Tooltip>
                </div>
              )}
              {lead.category_name && (
                <div className="flex items-start justify-between gap-3 min-w-0">
                  <span className="text-muted-foreground flex items-center gap-1.5 shrink-0"><Tag className="h-3.5 w-3.5" /> Categoria</span>
                  <span className="text-right min-w-0 break-words">{lead.category_name}</span>
                </div>
              )}
              {lead.website && (
                <div className="flex items-start justify-between gap-3 min-w-0">
                  <span className="text-muted-foreground flex items-center gap-1.5 shrink-0"><ExternalLink className="h-3.5 w-3.5" /> Website</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <a href={lead.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-right min-w-0 truncate">{lead.website}</a>
                    </TooltipTrigger>
                    <TooltipContent>{lead.website}</TooltipContent>
                  </Tooltip>
                </div>
              )}
              {lead.total_score && (
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground flex items-center gap-1.5 shrink-0"><Star className="h-3.5 w-3.5" /> Score</span>
                  <span>{lead.total_score} ({lead.reviews_count || 0} avaliações)</span>
                </div>
              )}
              {lead.rank && (
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground shrink-0">Rank</span>
                  <span>{lead.rank}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Mensagem de Abordagem */}
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Mensagem de Abordagem</CardTitle>
                {!editingCopy ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => { setEditingCopy(true); setCopyDraft(lead.mensagem_abordagem_comercial || ""); }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleSaveCopy} disabled={updateCopy.isPending}>
                      <Check className="h-3.5 w-3.5 text-success" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingCopy(false)}>
                      <X className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {editingCopy ? (
                <Textarea
                  value={copyDraft}
                  onChange={(e) => setCopyDraft(e.target.value)}
                  className="min-h-[120px] text-sm"
                  placeholder="Escreva a mensagem de abordagem..."
                />
              ) : lead.mensagem_abordagem_comercial ? (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{lead.mensagem_abordagem_comercial}</p>
              ) : (
                <p className="text-sm text-muted-foreground/50 italic">Nenhuma mensagem de abordagem ainda.</p>
              )}
            </CardContent>
          </Card>

          {/* Comentários */}
          <LeadComments leadId={lead.id} />

          {/* Quick actions */}
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Ações rápidas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => {
                  const nextIdx = KANBAN_COLUMNS.indexOf(lead.status as LeadStatus);
                  if (nextIdx < KANBAN_COLUMNS.length - 1) {
                    handleStatusChange(KANBAN_COLUMNS[nextIdx + 1]);
                  }
                }}
                disabled={lead.status === "CLOSED_LOST" || lead.status === "CLOSED_WON"}
              >
                <ArrowRight className="h-4 w-4 mr-2" /> Avançar etapa
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => { setEditingCopy(true); setCopyDraft(lead.mensagem_abordagem_comercial || ""); }}
              >
                <Pencil className="h-4 w-4 mr-2" /> Editar abordagem
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Chat */}
        <div className="lg:col-span-2">
          <Card className="border-border/50 flex flex-col h-[calc(100vh-280px)] min-h-[400px]">
            <CardHeader className="pb-3 border-b border-border/50">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageCircle className="h-4 w-4" /> Conversas
                <Badge variant="secondary" className="ml-auto text-xs">{messages.length} msgs</Badge>
              </CardTitle>
            </CardHeader>

            <div ref={chatViewportRef} className="flex-1 overflow-y-auto px-4">
              <div className="py-4 space-y-4">
                {msgLoading ? (
                  <LoadingState variant="inline" count={3} />
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground/50">
                    <MessageCircle className="h-8 w-8 mb-2" />
                    <p className="text-sm">Nenhuma mensagem ainda</p>
                    <p className="text-xs">Envie a primeira mensagem abaixo</p>
                  </div>
                ) : (
                  groupedMessages.map((group) => (
                    <div key={group.label}>
                      <div className="flex items-center gap-3 my-3">
                        <div className="flex-1 h-px bg-border/50" />
                        <span className="text-xs text-muted-foreground/60">{group.label}</span>
                        <div className="flex-1 h-px bg-border/50" />
                      </div>
                      {group.msgs.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex gap-2 mb-3 ${msg.sender === "LEAD" ? "justify-start" : "justify-end"}`}
                        >
                          <div
                            className={`max-w-[75%] rounded-xl px-3.5 py-2.5 text-sm ${
                              msg.sender === "LEAD"
                                ? "bg-secondary text-foreground"
                                : msg.sender === "AI"
                                ? "bg-accent/15 text-foreground"
                                : "bg-primary/15 text-foreground"
                            }`}
                          >
                            <div className="flex items-center gap-1.5 mb-1 text-xs text-muted-foreground">
                              {senderIcon(msg.sender)}
                              <span className="font-medium">{senderLabel(msg.sender)}</span>
                              <span className="ml-auto">{format(new Date(msg.timestamp), "HH:mm")}</span>
                            </div>
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Composer */}
            <div className="border-t border-border/50 p-3">
              <div className="flex gap-2">
                <Textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Digite sua mensagem..."
                  className="min-h-[44px] max-h-[120px] resize-none text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                />
                <Button
                  size="icon"
                  onClick={handleSend}
                  disabled={sendMessage.isPending || !newMessage.trim()}
                  aria-label="Enviar mensagem"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
      </TooltipProvider>
      <WhatsAppDisconnectedDialog
        open={showWhatsAppDisconnectedModal}
        onOpenChange={setShowWhatsAppDisconnectedModal}
      />
      <Dialog open={showCopyLockModal} onOpenChange={setShowCopyLockModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Geração de copy em andamento</DialogTitle>
            <DialogDescription>
              Já existe uma geração de copy em processamento. Aguarde a conclusão antes de iniciar outra.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setShowCopyLockModal(false)}>Entendi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default LeadDetail;
