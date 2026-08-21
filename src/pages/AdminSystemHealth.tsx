import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  FileCheck,
  Gauge,
  HeartPulse,
  History,
  RefreshCw,
  Server,
  Waves,
} from "lucide-react";
import SEO from "@/components/SEO";
import PageHeader from "@/components/PageHeader";
import LoadingState from "@/components/LoadingState";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAdminSystemHealth, useAdminSystemHealthHistory } from "@/hooks/useAdminSystemHealth";
import { useAdminCopyQuality } from "@/hooks/useAdminCopyQuality";
import {
  formatDuration,
  formatSnapshotTime,
  getAttentionLevel,
  getBaselinePosition,
  getHistoryCoverage,
  getTelemetryLevel,
  type BaselineMetric,
  type BaselinePosition,
  type SignalLevel,
} from "@/lib/system-health";
import { formatPercent, getCheckLabel, getCopyQualityLevel } from "@/lib/copy-quality";

const levelLabels: Record<SignalLevel, string> = {
  healthy: "Operacional",
  warning: "Atenção",
  critical: "Ação necessária",
  unknown: "Sem medição",
};

const badgeVariants: Record<SignalLevel, "success" | "warning" | "destructive" | "secondary"> = {
  healthy: "success",
  warning: "warning",
  critical: "destructive",
  unknown: "secondary",
};

interface SignalCardProps {
  title: string;
  value: string | number;
  description: string;
  level: SignalLevel;
  icon: typeof Activity;
}

const SignalCard = ({ title, value, description, level, icon: Icon }: SignalCardProps) => (
  <Card className="border-border/50">
    <CardHeader className="space-y-3 pb-3">
      <div className="flex items-center justify-between gap-3">
        <Icon className="h-5 w-5 text-muted-foreground" />
        <Badge variant={badgeVariants[level]}>{levelLabels[level]}</Badge>
      </div>
      <div>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="mt-1 text-2xl">{value}</CardTitle>
      </div>
    </CardHeader>
    <CardContent className="text-xs text-muted-foreground">{description}</CardContent>
  </Card>
);

const Metric = ({ label, value, note }: { label: string; value: string | number; note?: string }) => (
  <div className="rounded-lg border border-border/50 bg-muted/20 p-4">
    <p className="text-sm text-muted-foreground">{label}</p>
    <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
  </div>
);

const baselineLabels: Record<BaselinePosition, string> = {
  collecting: "Coletando",
  within: "Na faixa",
  above: "Acima da faixa",
  below: "Abaixo da faixa",
};

const baselineVariants: Record<BaselinePosition, "success" | "warning" | "secondary"> = {
  collecting: "secondary",
  within: "success",
  above: "warning",
  below: "secondary",
};

const formatBaselineNumber = (value: number | null) => {
  if (value === null) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
};

const BaselineComparison = ({ label, current, metric, ready }: {
  label: string;
  current: number | null;
  metric: BaselineMetric;
  ready: boolean;
}) => {
  const position = ready ? getBaselinePosition(current, metric) : "collecting";

  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Badge variant={baselineVariants[position]}>{baselineLabels[position]}</Badge>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{formatBaselineNumber(current)}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Referência: {formatBaselineNumber(metric.median)} · faixa {formatBaselineNumber(metric.p10)}–{formatBaselineNumber(metric.p90)}
      </p>
    </div>
  );
};

const AdminSystemHealth = () => {
  const { data, isLoading, isError, error, refetch, isFetching } = useAdminSystemHealth();
  const history = useAdminSystemHealthHistory();
  const copyQuality = useAdminCopyQuality();

  if (isLoading) return <LoadingState variant="page" count={6} />;

  if (isError || !data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Saúde do sistema" description="Visão operacional administrativa." />
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Não foi possível carregar o snapshot</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{error instanceof Error ? error.message : "Tente novamente em instantes."}</span>
            <Button size="sm" variant="outline" onClick={() => void refetch()}>Tentar novamente</Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const attentionLevel = getAttentionLevel(data);
  const telemetryLevel = getTelemetryLevel(data);
  const stuckTotal = data.stuck.searches + data.stuck.copy_requests + data.stuck.leads;

  return (
    <div className="space-y-6 overflow-y-auto pb-8">
      <SEO title="Admin — Saúde do sistema" description="Snapshot operacional do Prospectus." />
      <PageHeader
        title="Saúde do sistema"
        description="Foto operacional atualizada automaticamente a cada 60 segundos."
        breadcrumbs={[{ label: "Admin" }, { label: "Saúde do sistema" }]}
        actions={(
          <Button
            variant="outline"
            size="sm"
            onClick={() => void Promise.all([refetch(), history.refetch(), copyQuality.refetch()])}
            disabled={isFetching || history.isFetching || copyQuality.isFetching}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching || history.isFetching || copyQuality.isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        )}
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />Snapshot: {formatSnapshotTime(data.captured_at)}</span>
        <span>Último evento: {formatSnapshotTime(data.telemetry.last_event_at)}</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SignalCard title="Banco e consulta" value="Respondendo" description="O snapshot administrativo foi lido com sucesso." level="healthy" icon={Database} />
        <SignalCard title="Pendências detectadas" value={stuckTotal} description="Buscas, copies e leads além dos limites operacionais." level={attentionLevel} icon={AlertTriangle} />
        <SignalCard title="Telemetria nas últimas 24h" value={data.telemetry.events_24h} description={`${data.telemetry.errors_24h} evento(s) com sinal de erro.`} level={telemetryLevel} icon={Activity} />
        <SignalCard title="Disponibilidade externa" value="Pendente" description="O monitor sintético ainda não foi configurado." level="unknown" icon={Gauge} />
      </div>

      <Card className="border-border/50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Baseline histórica</CardTitle>
          </div>
          <CardDescription>
            Compara o valor atual com a mediana e a faixa típica do mesmo horário nos últimos 28 dias.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {history.isLoading ? (
            <LoadingState variant="cards" count={4} />
          ) : history.isError || !history.data ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Histórico indisponível</AlertTitle>
              <AlertDescription>O snapshot atual continua válido, mas a comparação histórica não pôde ser carregada.</AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                <span>Coleta a cada {history.data.frequency_minutes} minutos</span>
                <span>{history.data.samples} amostras nos últimos 7 dias ({getHistoryCoverage(history.data)}% de cobertura)</span>
                <span>Início: {formatSnapshotTime(history.data.first_captured_at)}</span>
              </div>

              {history.data.reference.status === "collecting" && (
                <Alert>
                  <Clock3 className="h-4 w-4" />
                  <AlertTitle>Coletando histórico</AlertTitle>
                  <AlertDescription>
                    A comparação será habilitada após {history.data.reference.minimum_samples} amostras equivalentes. Já temos {history.data.reference.samples}.
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <BaselineComparison
                  label="Pendências detectadas"
                  current={stuckTotal}
                  metric={history.data.reference.metrics.stuck_total}
                  ready={history.data.reference.status === "ready"}
                />
                <BaselineComparison
                  label="Erros — 24h"
                  current={data.telemetry.errors_24h}
                  metric={history.data.reference.metrics.telemetry_errors_24h}
                  ready={history.data.reference.status === "ready"}
                />
                <BaselineComparison
                  label="Operações ativas"
                  current={data.operations.active}
                  metric={history.data.reference.metrics.operations_active}
                  ready={history.data.reference.status === "ready"}
                />
                <BaselineComparison
                  label="Profundidade total das filas"
                  current={data.queues.length > 0 ? data.queues.reduce((total, queue) => total + queue.queue_depth, 0) : null}
                  metric={history.data.reference.metrics.queue_depth}
                  ready={history.data.reference.status === "ready"}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {attentionLevel === "critical" && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Há itens que exigem triagem</AlertTitle>
          <AlertDescription>
            Estes números são detectores, não incidentes confirmados. Valide as operações mais antigas antes de corrigir dados ou emitir estornos.
          </AlertDescription>
        </Alert>
      )}

      <Card className="border-border/50">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FileCheck className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Grounding da copy fria</CardTitle>
            </div>
            {!copyQuality.isLoading && !copyQuality.isError && copyQuality.data && copyQuality.data.checks.length > 0 && (
              <Badge variant={badgeVariants[getCopyQualityLevel(copyQuality.data)]}>
                {levelLabels[getCopyQualityLevel(copyQuality.data)]}
              </Badge>
            )}
          </div>
          <CardDescription>
            Fidelidade da copy gerada (GENERATE_COPY, 58% dos créditos) contra reviews_count, total_score, website e
            Instagram do próprio lead. Snapshot diário, 1x/dia às 06:00 UTC.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {copyQuality.isLoading ? (
            <LoadingState variant="cards" count={3} />
          ) : copyQuality.isError || !copyQuality.data ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Não foi possível carregar o grounding da copy</AlertTitle>
              <AlertDescription>
                {copyQuality.error instanceof Error ? copyQuality.error.message : "Tente novamente em instantes."}
              </AlertDescription>
            </Alert>
          ) : copyQuality.data.checks.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <Clock3 className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-2 font-medium">Ainda sem snapshot</p>
              <p className="mt-1 text-sm text-muted-foreground">O cron diário ainda não gerou o primeiro ponto.</p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 className="h-3.5 w-3.5" />
                  Último snapshot: {formatSnapshotTime(copyQuality.data.last_captured_at)}
                </span>
                <span>
                  Agenda: {copyQuality.data.schedule ?? "—"} (UTC)
                  {copyQuality.data.job_active === false ? " · job desativado" : ""}
                </span>
                <span>
                  Última execução do cron:{" "}
                  {copyQuality.data.last_run
                    ? `${formatSnapshotTime(copyQuality.data.last_run.start_time)} (${copyQuality.data.last_run.status})`
                    : "ainda não rodou pelo scheduler"}
                </span>
                <span>Último alerta enviado: {formatSnapshotTime(copyQuality.data.last_alert_sent_at)}</span>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Checagem</TableHead>
                    <TableHead>Severidade</TableHead>
                    <TableHead>Universo</TableHead>
                    <TableHead>Falhas (total)</TableHead>
                    <TableHead>Taxa histórica</TableHead>
                    <TableHead>Falhas (24h)</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {copyQuality.data.checks.map((check) => (
                    <TableRow key={check.check_name}>
                      <TableCell className="font-medium">{getCheckLabel(check.check_name)}</TableCell>
                      <TableCell>
                        <Badge variant={check.severity === "gate" ? "secondary" : "outline"}>
                          {check.severity === "gate" ? "Gate" : "Métrica"}
                        </Badge>
                      </TableCell>
                      <TableCell>{check.universo_total}</TableCell>
                      <TableCell>{check.falhas_total}</TableCell>
                      <TableCell>{formatPercent(check.taxa_total_pct)}</TableCell>
                      <TableCell>{check.falhas_24h}</TableCell>
                      <TableCell>
                        {check.is_regression ? (
                          <Badge variant="destructive">Regressão nova</Badge>
                        ) : check.falhas_total > 0 ? (
                          <Badge variant="warning">Backlog conhecido</Badge>
                        ) : (
                          <Badge variant="success">OK</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <HeartPulse className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Pendências operacionais</CardTitle>
          </div>
          <CardDescription>Itens que ultrapassaram os limites definidos nas views operacionais.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Buscas presas" value={data.stuck.searches} note={`Mais antiga: ${formatDuration(data.stuck.searches_oldest_seconds)}`} />
          <Metric label="Copies presas" value={data.stuck.copy_requests} note={`Mais antiga: ${formatDuration(data.stuck.copy_oldest_seconds)}`} />
          <Metric label="Leads em COPY_PENDING" value={data.stuck.copy_pending_leads} note={`Mais antigo do grupo: ${formatDuration(data.stuck.leads_oldest_seconds)}`} />
          <Metric label="Leads em SEND_PENDING" value={data.stuck.send_pending_leads} note="Estado pago ainda não concluído" />
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="border-border/50">
          <CardHeader>
            <div className="flex items-center gap-2"><Waves className="h-5 w-5 text-primary" /><CardTitle className="text-lg">Telemetria — 24 horas</CardTitle></div>
            <CardDescription>Sinais sanitizados recebidos pelo contrato operacional.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Metric label="Eventos" value={data.telemetry.events_24h} />
            <Metric label="Erros sinalizados" value={data.telemetry.errors_24h} />
            <Metric label="Erros frontend" value={data.telemetry.frontend_errors_24h} />
            <Metric label="Amostras Web Vitals" value={data.telemetry.web_vitals_24h} note={`${data.telemetry.frontend_sessions_24h} sessão(ões) observada(s)`} />
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader>
            <div className="flex items-center gap-2"><Server className="h-5 w-5 text-primary" /><CardTitle className="text-lg">Operações correlacionadas</CardTitle></div>
            <CardDescription>Estado atual das operações registradas desde o início da telemetria.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Metric label="Ativas" value={data.operations.active} note={data.operations.oldest_active_at ? `Mais antiga: ${formatSnapshotTime(data.operations.oldest_active_at)}` : "Nenhuma operação ativa"} />
            <Metric label="Em fila" value={data.operations.queued} />
            <Metric label="Processando" value={data.operations.processing} />
            <Metric label="Falhas terminais" value={data.operations.failed} />
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50">
        <CardHeader>
          <div className="flex items-center gap-2"><Server className="h-5 w-5 text-primary" /><CardTitle className="text-lg">Filas</CardTitle></div>
          <CardDescription>Último snapshot agregado disponível para cada fila.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.queues.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <AlertTriangle className="mx-auto h-6 w-6 text-warning" />
              <p className="mt-2 font-medium">Snapshots de fila ainda não disponíveis</p>
              <p className="mt-1 text-sm text-muted-foreground">A tela não interpreta ausência de dados como fila vazia.</p>
            </div>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Fila</TableHead><TableHead>Profundidade</TableHead><TableHead>Processando</TableHead><TableHead>Falhas</TableHead><TableHead>Item mais antigo</TableHead><TableHead>Capturado em</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.queues.map((queue) => (
                  <TableRow key={queue.queue_name}>
                    <TableCell className="font-medium">{queue.queue_name}</TableCell><TableCell>{queue.queue_depth}</TableCell><TableCell>{queue.processing_count}</TableCell><TableCell>{queue.failed_count}</TableCell><TableCell>{formatDuration(queue.oldest_age_seconds)}</TableCell><TableCell>{formatSnapshotTime(queue.captured_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-muted/20">
        <CardHeader>
          <div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-muted-foreground" /><CardTitle className="text-base">Cobertura desta versão</CardTitle></div>
          <CardDescription>“Sem dados” é tratado de forma diferente de “zero”.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant="success">Banco e detectores ativos</Badge>
          <Badge variant={data.coverage.queue_snapshots ? "success" : "secondary"}>Snapshots de fila {data.coverage.queue_snapshots ? "ativos" : "pendentes"}</Badge>
          <Badge variant="secondary">Monitor sintético pendente</Badge>
          <Badge variant="secondary">CPU, memória e conexões pendentes</Badge>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminSystemHealth;
