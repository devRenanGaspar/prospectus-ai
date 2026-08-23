import { useState, useMemo, useCallback, memo, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import SEO from "@/components/SEO";
import PageHeader from "@/components/PageHeader";
import { KANBAN_COLUMNS, LEAD_STATUS_LABELS, LEAD_STATUS_SUBTITLES, LEAD_STATUS_ICONS, type LeadStatus } from "@/lib/constants";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, AlertTriangle, Search, FileText, Send, Sparkles, Zap, User, CheckCircle, Trophy, XCircle, Info } from "lucide-react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import SearchInput from "@/components/SearchInput";
import LeadCard from "@/components/LeadCard";
import LoadingState from "@/components/LoadingState";
import ErrorState from "@/components/ErrorState";
import { useLeads, useUpdateLeadStatus, useFindNewLeads, useBulkUpdateLeadStatus, type Lead } from "@/hooks/useLeads";
import BulkMoveBar from "@/components/BulkMoveBar";
import { usePendingCopyRequest, useRequestCopy, copyRequestPendingKey, fetchPendingCopyRequest } from "@/hooks/useCopyRequest";
import { useRequestSend } from "@/hooks/useSendRequest";
import { useCreditBalance } from "@/hooks/useCreditBalance";
import { useWhatsApp } from "@/hooks/useWhatsApp";
import { useAgencyContext, useUpdateAgencyContext, type AgencyICP } from "@/hooks/useAgencyContext";
import { useNicheOptions } from "@/hooks/useNicheOptions";
import LocationPicker, { buildLocalizacaoString } from "@/components/LocationPicker";
import WhatsAppDisconnectedDialog from "@/components/WhatsAppDisconnectedDialog";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

const emptyICP: AgencyICP = {
  nichoPrincipal: "",
  nichoSecundario: "",
  nichoAlternativo: "",
  localizacao: "",
  estado: "",
  cidade: "",
  idioma: "",
};

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Sparkles, Zap, User, CheckCircle, Trophy, XCircle,
};

const StatusIcon = memo(({ iconName, isSystem }: { iconName: string; isSystem: boolean }) => {
  const Icon = ICON_MAP[iconName];
  if (!Icon) return null;
  return <Icon className={`h-3.5 w-3.5 ${isSystem ? "text-accent-foreground" : "text-muted-foreground/70"}`} />;
});
StatusIcon.displayName = "StatusIcon";

// Memoized column component
const KanbanColumn = memo(({
  status,
  leads,
  isDraggingOver,
  onPrepareAll,
  onSendAll,
  selectMode,
  selectedIds,
  onEnterSelectMode,
  onExitSelectMode,
  onToggleSelect,
  onSelectAll,
}: {
  status: LeadStatus;
  leads: Lead[];
  isDraggingOver: boolean;
  onPrepareAll?: () => void;
  onSendAll?: () => void;
  selectMode: boolean;
  selectedIds: Set<string>;
  onEnterSelectMode: () => void;
  onExitSelectMode: () => void;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
}) => {
  const allSelected = leads.length > 0 && selectedIds.size === leads.length;
  return (
  <div className="w-[280px] flex-shrink-0">
    <Card
      className={`border-border/50 transition-colors duration-200 ${
        isDraggingOver ? "bg-primary/5 border-primary/30" : "bg-card/50"
      } ${selectMode ? "ring-1 ring-primary/40" : ""}`}
    >
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <StatusIcon iconName={LEAD_STATUS_ICONS[status]} isSystem={status === "COPY_PENDING" || status === "SEND_PENDING"} />
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {LEAD_STATUS_LABELS[status]}
            </CardTitle>
          </div>
          <span className="text-xs text-muted-foreground/60 bg-muted rounded-full px-2 py-0.5">
            {leads.length}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground/50 leading-tight">
          {LEAD_STATUS_SUBTITLES[status]}
        </p>
        {status === "SEND_PENDING" && (
          <p className="text-[11px] text-amber-400/80 leading-tight mt-1">
            ⚠️ O sistema envia 1 mensagem a cada 15 minutos por segurança.
          </p>
        )}
        {leads.length > 0 && (
          <div className="mt-1 flex items-center justify-between">
            {selectMode ? (
              <>
                <button
                  type="button"
                  onClick={onSelectAll}
                  className="text-[11px] text-primary hover:underline"
                >
                  {allSelected ? "Limpar" : `Selecionar todos (${leads.length})`}
                </button>
                <button
                  type="button"
                  onClick={onExitSelectMode}
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Cancelar
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onEnterSelectMode}
                className="text-[11px] text-muted-foreground hover:text-foreground hover:underline ml-auto"
              >
                Selecionar
              </button>
            )}
          </div>
        )}
        {status === "NEW" && leads.length > 0 && onPrepareAll && !selectMode && (
          <Button
            variant="subtle"
            size="sm"
            className="mt-2 w-full text-xs"
            onClick={onPrepareAll}
          >
            <FileText className="h-3 w-3 mr-1" />
            Preparar Copy de Todos
          </Button>
        )}
        {status === "COPY_READY" && leads.length > 0 && onSendAll && !selectMode && (
          <Button
            variant="subtle"
            size="sm"
            className="mt-2 w-full text-xs"
            onClick={onSendAll}
          >
            <Send className="h-3 w-3 mr-1" />
            Enviar Todos
          </Button>
        )}
      </CardHeader>
      <div className="px-3 pb-4 min-h-[200px] max-h-[calc(100vh-320px)] overflow-y-auto space-y-2">
        {leads.map((lead, index) => (
          <Draggable
            key={lead.id}
            draggableId={lead.id}
            index={index}
            isDragDisabled={selectMode}
          >
            {(dragProvided, dragSnapshot) => (
              <div
                ref={dragProvided.innerRef}
                {...dragProvided.draggableProps}
                {...dragProvided.dragHandleProps}
              >
                <LeadCard
                  lead={lead}
                  isDragging={dragSnapshot.isDragging}
                  selectable={selectMode}
                  selected={selectedIds.has(lead.id)}
                  onToggleSelect={() => onToggleSelect(lead.id)}
                />
              </div>
            )}
          </Draggable>
        ))}
        {leads.length === 0 && (
          <p className="text-xs text-muted-foreground/40 text-center py-8">Sem leads</p>
        )}
      </div>
    </Card>
  </div>
  );
});
KanbanColumn.displayName = "KanbanColumn";

const LeadsBoard = () => {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<LeadStatus | "ALL">("ALL");
  const { data: leads = [], isLoading, isError, refetch } = useLeads();
  const updateStatus = useUpdateLeadStatus();
  const findLeads = useFindNewLeads();
  const requestCopy = useRequestCopy();
  const { data: pendingCopy } = usePendingCopyRequest();
  const requestSend = useRequestSend();
  const { data: credits } = useCreditBalance();
  const { verifyConnection } = useWhatsApp();
  const bulkUpdate = useBulkUpdateLeadStatus();
  const [selectModeColumn, setSelectModeColumn] = useState<LeadStatus | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [showCreditsModal, setShowCreditsModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showSearchLockModal, setShowSearchLockModal] = useState(false);
  const [showCopyLockModal, setShowCopyLockModal] = useState(false);
  
  const [showWhatsAppDisconnectedModal, setShowWhatsAppDisconnectedModal] = useState(false);
  const [searchQuantity, setSearchQuantity] = useState(10);

  const [searchLimitPerNiche, setSearchLimitPerNiche] = useState(0);
  const [requireWebsite, setRequireWebsite] = useState(false);
  const [requireInstagram, setRequireInstagram] = useState(false);

  const { data: agencyContext, isLoading: isLoadingAgency } = useAgencyContext();
  const updateAgencyContext = useUpdateAgencyContext();
  const { data: nicheOptions = [] } = useNicheOptions();
  const [icpDraft, setIcpDraft] = useState<AgencyICP>(emptyICP);
  const [icpError, setIcpError] = useState<string | null>(null);

  // Hidrata o draft ao abrir o modal (ou quando o contexto carrega com o modal aberto)
  useEffect(() => {
    if (showSearchModal && agencyContext?.context_icp) {
      setIcpDraft({ ...emptyICP, ...agencyContext.context_icp });
      setIcpError(null);
    }
  }, [showSearchModal, agencyContext]);

  const filteredLeads = useMemo(() => {
    let result = leads;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          l.company_name?.toLowerCase().includes(q) ||
          l.source?.toLowerCase().includes(q)
      );
    }
    if (filterStatus !== "ALL") {
      result = result.filter((l) => l.status === filterStatus);
    }
    return result;
  }, [leads, search, filterStatus]);

  const columnLeads = useMemo(() => {
    const map: Record<string, typeof leads> = {};
    KANBAN_COLUMNS.forEach((col) => {
      map[col] = filteredLeads.filter((l) => l.status === col);
    });
    return map;
  }, [filteredLeads]);

  const handleCopyRequest = useCallback(
    async (leadIds: string[]) => {
      if (pendingCopy && user) {
        // Fallback: reconfirma direto no DB caso o realtime tenha perdido o evento
        const fresh = await queryClient.fetchQuery({
          queryKey: copyRequestPendingKey(user.id),
          queryFn: () => fetchPendingCopyRequest(user.id),
        });
        if (fresh) {
          setShowCopyLockModal(true);
          return;
        }
      }
      requestCopy.mutate(leadIds);
    },
    [pendingCopy, requestCopy, user, queryClient]
  );

  const handleSendRequest = useCallback(
    async (leadIds: string[]) => {
      const loadingId = toast.loading("Verificando conexão do WhatsApp...");
      const ok = await verifyConnection();
      toast.dismiss(loadingId);
      if (!ok) {
        setShowWhatsAppDisconnectedModal(true);
        return;
      }
      requestSend.mutate(leadIds);
    },
    [requestSend, verifyConnection]
  );


  const onDragEnd = useCallback(
    (result: DropResult) => {
      if (!result.destination) return;
      const newStatus = result.destination.droppableId as LeadStatus;
      const leadId = result.draggableId;
      const lead = leads.find((l) => l.id === leadId);
      if (!lead || lead.status === newStatus) return;

      // If moving to COPY_PENDING, use the copy request flow
      if (newStatus === "COPY_PENDING") {
        handleCopyRequest([leadId]);
        return;
      }

      // If moving to SEND_PENDING, use the send request flow
      if (newStatus === "SEND_PENDING") {
        handleSendRequest([leadId]);
        return;
      }

      updateStatus.mutate({ leadId, status: newStatus });
      toast.success(`Lead movido para ${LEAD_STATUS_LABELS[newStatus]}`);
    },
    [leads, updateStatus, handleCopyRequest, handleSendRequest]
  );

  const handlePrepareAll = useCallback(() => {
    const newLeadIds = (columnLeads["NEW"] ?? []).map((l) => l.id);
    if (newLeadIds.length === 0) return;
    handleCopyRequest(newLeadIds);
  }, [columnLeads, handleCopyRequest]);

  const handleSendAll = useCallback(() => {
    const readyLeadIds = (columnLeads["COPY_READY"] ?? []).map((l) => l.id);
    if (readyLeadIds.length === 0) return;
    handleSendRequest(readyLeadIds);
  }, [columnLeads, handleSendRequest]);

  const exitSelectMode = useCallback(() => {
    setSelectModeColumn(null);
    setSelectedIds(new Set());
  }, []);

  const enterSelectMode = useCallback((status: LeadStatus) => {
    setSelectModeColumn(status);
    setSelectedIds(new Set());
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllInColumn = useCallback((status: LeadStatus) => {
    const ids = (columnLeads[status] ?? []).map((l) => l.id);
    setSelectedIds((prev) => (prev.size === ids.length ? new Set() : new Set(ids)));
  }, [columnLeads]);

  const handleBulkMove = useCallback(
    async (target: LeadStatus) => {
      const ids = Array.from(selectedIds);
      if (ids.length === 0 || !selectModeColumn) return;

      if (target === "COPY_PENDING") {
        await handleCopyRequest(ids);
        exitSelectMode();
        return;
      }
      if (target === "SEND_PENDING") {
        await handleSendRequest(ids);
        exitSelectMode();
        return;
      }
      bulkUpdate.mutate(
        { leadIds: ids, status: target },
        {
          onSuccess: () => {
            toast.success(`${ids.length} lead(s) movido(s) para ${LEAD_STATUS_LABELS[target]}`);
            exitSelectMode();
          },
        }
      );
    },
    [selectedIds, selectModeColumn, handleCopyRequest, handleSendRequest, bulkUpdate, exitSelectMode]
  );


  const handleFindLeads = () => {
    if ((credits ?? 0) < 5) {
      setShowCreditsModal(true);
      return;
    }
    setShowSearchModal(true);
  };

  const handleConfirmSearch = async () => {
    // Validation: primary niche is required
    if (!icpDraft.nichoPrincipal?.trim()) {
      setIcpError("Selecione o nicho principal antes de buscar.");
      return;
    }
    setIcpError(null);

    // Persist the ICP if it changed relative to what was saved
    let mergedAgency = agencyContext;
    let normalizedDraft: AgencyICP = icpDraft;
    try {
      if (agencyContext) {
        const current = agencyContext.context_icp ?? emptyICP;
        normalizedDraft = {
          ...icpDraft,
          localizacao: buildLocalizacaoString(icpDraft.estado, icpDraft.cidade),
        };
        mergedAgency = { ...agencyContext, context_icp: normalizedDraft };
        const changed =
          current.nichoPrincipal !== normalizedDraft.nichoPrincipal ||
          current.nichoSecundario !== normalizedDraft.nichoSecundario ||
          current.nichoAlternativo !== normalizedDraft.nichoAlternativo ||
          (current.estado ?? "") !== (normalizedDraft.estado ?? "") ||
          (current.cidade ?? "") !== (normalizedDraft.cidade ?? "") ||
          (current.localizacao ?? "") !== (normalizedDraft.localizacao ?? "");

        if (changed) {
          await updateAgencyContext.mutateAsync({
            data: mergedAgency,
            silent: true,
          });
        }
      }
    } catch {
      toast.error("Não foi possível salvar o ICP. Tente novamente.");
      return;
    }

    findLeads.mutate(
      {
        quantity: searchQuantity,
        limitPerNiche: searchLimitPerNiche,
        requireWebsite,
        requireInstagram,
        agencyOverride: mergedAgency
          ? {
              name: mergedAgency.name,
              business_type: mergedAgency.business_type,
              context_persona: mergedAgency.context_persona,
              context_icp: mergedAgency.context_icp,
              context_qualification: mergedAgency.context_qualification,
            }
          : undefined,
      },
      {
        onSuccess: () => {
          setShowSearchModal(false);
          setSearchQuantity(10);
          setSearchLimitPerNiche(0);
          setRequireWebsite(false);
          setRequireInstagram(false);
        },
        onError: (error) => {
          if (error.message === "SEARCH_IN_PROGRESS") {
            setShowSearchModal(false);
            setShowSearchLockModal(true);
          }
        },
      }
    );
  };

  if (isError) {
    return (
      <>
        <SEO title="Kanban de Leads" />
        <ErrorState onRetry={() => refetch()} />
      </>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <SEO title="Kanban de Leads" description="Gerencie seu pipeline de leads no board Kanban." />
      <PageHeader
        title="Pipeline de Leads"
        description="Arraste e organize seus leads entre as etapas do funil."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Leads" }]}
        actions={
          <Button
            variant="premium"
            size="sm"
            onClick={handleFindLeads}
            disabled={findLeads.isPending}
          >
            {findLeads.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-1" />
            )}
            Buscar Novos Leads
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4 animate-fade-in">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Filtrar leads..."
          className="sm:max-w-xs"
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as LeadStatus | "ALL")}
          className="h-10 rounded-md border border-input bg-secondary/50 px-3 text-sm text-foreground focus:ring-2 focus:ring-ring"
          aria-label="Filtrar por status"
        >
          <option value="ALL">Todos os status</option>
          {KANBAN_COLUMNS.map((s) => (
            <option key={s} value={s}>
              {LEAD_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <LoadingState variant="page" count={4} />
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <ScrollArea className="w-full animate-fade-in flex-1 min-h-0">
            <div className="flex gap-4 pb-4 min-w-max">
              {KANBAN_COLUMNS.map((status) => (
                <Droppable key={status} droppableId={status}>
                  {(provided, snapshot) => (
                    <div ref={provided.innerRef} {...provided.droppableProps}>
                      <KanbanColumn
                        status={status}
                        leads={columnLeads[status] ?? []}
                        isDraggingOver={snapshot.isDraggingOver}
                        onPrepareAll={status === "NEW" ? handlePrepareAll : undefined}
                        onSendAll={status === "COPY_READY" ? handleSendAll : undefined}
                        selectMode={selectModeColumn === status}
                        selectedIds={selectModeColumn === status ? selectedIds : new Set()}
                        onEnterSelectMode={() => enterSelectMode(status)}
                        onExitSelectMode={exitSelectMode}
                        onToggleSelect={toggleSelect}
                        onSelectAll={() => selectAllInColumn(status)}
                      />
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </DragDropContext>
      )}

      {selectModeColumn && selectedIds.size > 0 && (
        <BulkMoveBar
          count={selectedIds.size}
          currentColumn={selectModeColumn}
          onMove={handleBulkMove}
          onCancel={exitSelectMode}
          isMoving={bulkUpdate.isPending}
        />
      )}

      {/* Search leads modal */}
      <Dialog open={showSearchModal} onOpenChange={setShowSearchModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Search className="h-5 w-5 text-primary" />
              Buscar Novos Leads
            </DialogTitle>
            <DialogDescription>
              Preencha os filtros abaixo e inicie a busca
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Seção ICP */}
            <div className="space-y-4">

              {isLoadingAgency ? (
                <div className="space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Nicho Principal *</Label>
                    <Select
                      value={icpDraft.nichoPrincipal || undefined}
                      onValueChange={(v) => {
                        setIcpDraft((d) => ({ ...d, nichoPrincipal: v }));
                        setIcpError(null);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o nicho principal" />
                      </SelectTrigger>
                      <SelectContent>
                        {icpDraft.nichoPrincipal &&
                          !nicheOptions.some((o) => o.name === icpDraft.nichoPrincipal) && (
                            <SelectItem value={icpDraft.nichoPrincipal}>
                              {icpDraft.nichoPrincipal} (salvo)
                            </SelectItem>
                          )}
                        {nicheOptions.map((opt) => (
                          <SelectItem key={opt.id} value={opt.name}>
                            {opt.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {icpError && (
                      <p className="text-xs font-medium text-destructive">{icpError}</p>
                    )}
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Nicho Secundário</Label>
                      <Select
                        value={icpDraft.nichoSecundario || undefined}
                        onValueChange={(v) =>
                          setIcpDraft((d) => ({ ...d, nichoSecundario: v }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione (opcional)" />
                        </SelectTrigger>
                        <SelectContent>
                          {icpDraft.nichoSecundario &&
                            !nicheOptions.some((o) => o.name === icpDraft.nichoSecundario) && (
                              <SelectItem value={icpDraft.nichoSecundario}>
                                {icpDraft.nichoSecundario} (salvo)
                              </SelectItem>
                            )}
                          {nicheOptions.map((opt) => (
                            <SelectItem key={opt.id} value={opt.name}>
                              {opt.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Nicho Alternativo</Label>
                      <Select
                        value={icpDraft.nichoAlternativo || undefined}
                        onValueChange={(v) =>
                          setIcpDraft((d) => ({ ...d, nichoAlternativo: v }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione (opcional)" />
                        </SelectTrigger>
                        <SelectContent>
                          {icpDraft.nichoAlternativo &&
                            !nicheOptions.some((o) => o.name === icpDraft.nichoAlternativo) && (
                              <SelectItem value={icpDraft.nichoAlternativo}>
                                {icpDraft.nichoAlternativo} (salvo)
                              </SelectItem>
                            )}
                          {nicheOptions.map((opt) => (
                            <SelectItem key={opt.id} value={opt.name}>
                              {opt.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <LocationPicker
                    estado={icpDraft.estado}
                    cidade={icpDraft.cidade}
                    onChange={({ estado, cidade }) =>
                      setIcpDraft((d) => ({ ...d, estado, cidade }))
                    }
                  />

                  <div className="flex items-start gap-2 rounded-md border border-border/50 bg-muted/40 p-3">
                    <Info className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Dica:</span> para obter mais
                      resultados, recomendamos realizar buscas sem filtrar por cidade. A busca em
                      nível nacional costuma encontrar leads mais relevantes.
                    </p>
                  </div>
                </>
              )}
            </div>

            <Separator />

            {/* Seção configurações */}
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="search-quantity">Quantos leads deseja buscar?</Label>
                  <Input
                    id="search-quantity"
                    type="number"
                    min={1}
                    max={100}
                    value={searchQuantity}
                    onChange={(e) => setSearchQuantity(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                  />
                  <p className="text-xs text-muted-foreground">Mínimo 1, máximo 100</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="search-limit-niche">Limite de leads por nicho?</Label>
                  <Input
                    id="search-limit-niche"
                    type="number"
                    min={0}
                    max={50}
                    value={searchLimitPerNiche}
                    onChange={(e) => setSearchLimitPerNiche(Math.max(0, Math.min(50, Number(e.target.value) || 0)))}
                  />
                  <p className="text-xs text-muted-foreground">0 = sem limite por nicho</p>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border/50 p-4">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Obrigatório ter website?</Label>
                  <p className="text-xs text-muted-foreground">Leads sem website serão filtrados</p>
                </div>
                <Switch checked={requireWebsite} onCheckedChange={setRequireWebsite} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSearchModal(false)}>
              Cancelar
            </Button>
            <Button
              variant="premium"
              onClick={handleConfirmSearch}
              disabled={findLeads.isPending || isLoadingAgency || updateAgencyContext.isPending}
            >
              {findLeads.isPending || updateAgencyContext.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Search className="h-4 w-4 mr-1" />
              )}
              Buscar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Insufficient credits modal */}
      <Dialog open={showCreditsModal} onOpenChange={setShowCreditsModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Créditos insuficientes
            </DialogTitle>
            <DialogDescription>
              Você não possui créditos suficientes para buscar novos leads. Adquira mais créditos
              para continuar prospectando.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreditsModal(false)}>
              Cancelar
            </Button>
            <Button variant="premium" onClick={() => { setShowCreditsModal(false); navigate("/billing/plans"); }}>
              Ver Planos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Search in progress lock modal */}
      <Dialog open={showSearchLockModal} onOpenChange={setShowSearchLockModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 text-primary animate-spin" />
              Busca em andamento
            </DialogTitle>
            <DialogDescription>
              Ainda estamos processando sua última solicitação de busca de leads. Aguarde ela
              terminar, normalmente leva no máximo 30 minutos.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSearchLockModal(false)}>
              Entendi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Copy in progress lock modal */}
      <Dialog open={showCopyLockModal} onOpenChange={setShowCopyLockModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 text-primary animate-spin" />
              Geração de copy em andamento
            </DialogTitle>
            <DialogDescription>
              Ainda estamos gerando as copys da sua última solicitação. Aguarde finalizar antes
              de solicitar novamente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCopyLockModal(false)}>
              Entendi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <WhatsAppDisconnectedDialog
        open={showWhatsAppDisconnectedModal}
        onOpenChange={setShowWhatsAppDisconnectedModal}
      />
    </div>
  );
};

export default LeadsBoard;
