import { useState, useMemo } from "react";
import SEO from "@/components/SEO";
import PageHeader from "@/components/PageHeader";
import LoadingState from "@/components/LoadingState";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import StatCard from "@/components/StatCard";
import PermissionGate from "@/components/PermissionGate";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Zap, TrendingDown, BarChart3, ChevronLeft, ChevronRight, Eye, X, ShieldAlert } from "lucide-react";
import { useCreditBalance } from "@/hooks/useCreditBalance";
import { useUsageLogs, useUsageSummary } from "@/hooks/useUsageLogs";
import { useAdminUsers } from "@/hooks/useAdmin";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const ACTION_LABELS: Record<string, string> = {
  FIND_LEAD: "Buscar Leads",
  GENERATE_COPY: "Gerar Copy",
  SEND_MESSAGE: "Enviar Mensagem",
  QUALIFY_LEAD: "Qualificar Lead",
  FIND_LEAD_REFUND: "Reembolso de Busca",
};

const PAGE_SIZE = 20;

const formatDuration = (start: string, end: string | null): string => {
  if (!end) return "—";
  const diffMs = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 1000) return "<1s";
  const totalSec = Math.round(diffMs / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const totalMin = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (totalMin < 60) return sec ? `${totalMin}m ${sec}s` : `${totalMin}m`;
  const hours = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  return min ? `${hours}h ${min}m` : `${hours}h`;
};

const BillingUsage = () => {
  const [page, setPage] = useState(0);
  const [filterAction, setFilterAction] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const { profile } = useAuth();
  const isAdmin = profile?.role === "ADMIN";

  // Only fetch user list if admin
  const { data: adminUsers = [] } = useAdminUsers();

  const targetUser = useMemo(
    () => (selectedUserId ? adminUsers.find((u) => u.id === selectedUserId) : null),
    [selectedUserId, adminUsers]
  );

  const { data: ownCredits } = useCreditBalance();
  const { data: summary, isLoading: summaryLoading } = useUsageSummary(selectedUserId);
  const { data, isLoading, isError, refetch } = useUsageLogs(
    { action: filterAction || undefined, page, pageSize: PAGE_SIZE },
    selectedUserId
  );
  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const displayedBalance = selectedUserId
    ? targetUser?.credits_balance ?? 0
    : ownCredits ?? 0;

  const clearSelection = () => {
    setSelectedUserId(null);
    setPage(0);
    setFilterAction("");
  };

  return (
    <>
      <SEO title="Extrato de Créditos" description="Acompanhe o consumo de créditos por ação e período." />
      <PageHeader
        title="Extrato de Créditos"
        description={
          targetUser
            ? `Visualizando extrato de ${targetUser.full_name || "usuário"}.`
            : "Acompanhe seu histórico de consumo."
        }
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Extrato" }]}
      />

      {/* Admin user selector */}
      <PermissionGate requiredRole="ADMIN">
        <Card className="border-border/50 mb-4 animate-fade-in">
          <div className="p-4 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Eye className="h-4 w-4 text-primary" />
              <span>Modo Admin — visualizar extrato de:</span>
            </div>
            <Select
              value={selectedUserId ?? "self"}
              onValueChange={(v) => {
                setSelectedUserId(v === "self" ? null : v);
                setPage(0);
                setFilterAction("");
              }}
            >
              <SelectTrigger className="w-[280px] bg-secondary/50">
                <SelectValue placeholder="Selecione um usuário" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="self">Meu próprio extrato</SelectItem>
                {adminUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.full_name || "Sem nome"} {u.email ? `— ${u.email}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedUserId && (
              <Button variant="ghost" size="sm" onClick={clearSelection}>
                <X className="h-4 w-4 mr-1" /> Limpar
              </Button>
            )}
          </div>
        </Card>
      </PermissionGate>

      {/* Banner when admin viewing another user */}
      {isAdmin && targetUser && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 animate-fade-in">
          <ShieldAlert className="h-4 w-4 shrink-0 text-amber-500" />
          <div className="text-sm flex-1">
            Você está visualizando o extrato de{" "}
            <strong>{targetUser.full_name || "usuário sem nome"}</strong>
            {targetUser.email ? <span className="text-muted-foreground"> ({targetUser.email})</span> : null}.
          </div>
          <Button variant="outline" size="sm" onClick={clearSelection}>
            Voltar ao meu extrato
          </Button>
        </div>
      )}

      {/* Summary */}
      <section className="grid gap-4 sm:grid-cols-3 mb-6 animate-fade-in" aria-label="Resumo de créditos">
        <StatCard label="Saldo Atual" value={displayedBalance} icon={Zap} />
        <StatCard label="Consumido este mês" value={summary?.totalConsumed ?? 0} icon={TrendingDown} />
        <StatCard
          label="Principal ação"
          value={summary?.topActions?.[0]?.name ? (ACTION_LABELS[summary.topActions[0].name] ?? summary.topActions[0].name) : "—"}
          icon={BarChart3}
        />
      </section>

      {/* Top consumers */}
      {summary && summary.topActions.length > 0 && (
        <Card className="border-border/50 mb-6 animate-fade-in">
          <div className="p-5">
            <h2 className="text-base font-medium mb-3">Maiores consumidores</h2>
            <div className="flex flex-wrap gap-3">
              {summary.topActions.map((a) => (
                <div key={a.name} className="flex items-center gap-2 rounded-lg bg-secondary/50 px-3 py-2">
                  <span className="text-sm font-medium">{ACTION_LABELS[a.name] ?? a.name}</span>
                  <Badge variant="secondary">{a.cost} cr</Badge>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={filterAction}
          onChange={(e) => { setFilterAction(e.target.value); setPage(0); }}
          className="h-10 rounded-md border border-input bg-secondary/50 px-3 text-sm text-foreground"
          aria-label="Filtrar por ação"
        >
          <option value="">Todas as ações</option>
          {Object.entries(ACTION_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading || summaryLoading ? (
        <LoadingState variant="list" count={6} />
      ) : logs.length === 0 ? (
        <EmptyState
          icon={Zap}
          title="Nenhum consumo registrado"
          description="Quando você usar ações como buscar leads ou gerar copy, o histórico aparecerá aqui."
        />
      ) : (
        <>
          <Card className="border-border/50 animate-fade-in">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead>Custo</TableHead>
                  <TableHead>Duração</TableHead>
                  <TableHead className="hidden sm:table-cell">ID Busca</TableHead>
                  <TableHead className="hidden md:table-cell">Qtd Solicitada</TableHead>
                  <TableHead className="hidden sm:table-cell">Lead</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => {
                  const meta = log.metadata as Record<string, unknown> | null;
                  const searchId = meta?.search_id as string | undefined;
                  const qty = meta?.quantity as number | undefined;
                  const isRefund = log.action_name === "FIND_LEAD_REFUND" || log.cost < 0;
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm">
                        {format(new Date(log.timestamp), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={isRefund ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" : undefined}
                        >
                          {ACTION_LABELS[log.action_name] ?? log.action_name}
                        </Badge>
                      </TableCell>
                      <TableCell className={`font-medium ${isRefund ? "text-emerald-400" : ""}`}>
                        {isRefund ? `+${Math.abs(log.cost)}` : log.cost} cr
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground tabular-nums">
                        {formatDuration(log.timestamp, log.completed_at)}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-xs text-muted-foreground font-mono">
                        {searchId ? searchId.slice(0, 8) : "—"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm">
                        {qty ?? "—"}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                        {log.lead_id ? log.lead_id.slice(0, 8) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          {totalPages > 1 && (
            <nav className="flex items-center justify-center gap-4 mt-4" aria-label="Paginação">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
              </Button>
              <span className="text-sm text-muted-foreground">
                {page + 1} de {totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                Próximo <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </nav>
          )}
        </>
      )}
    </>
  );
};

export default BillingUsage;
