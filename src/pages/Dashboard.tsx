import { useAuth } from "@/contexts/AuthContext";
import { Users, MessageSquare, Zap, TrendingUp } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import SEO from "@/components/SEO";
import StatCard from "@/components/StatCard";
import EmptyState from "@/components/EmptyState";
import LoadingState from "@/components/LoadingState";
import ErrorState from "@/components/ErrorState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardMetrics, type FunnelStep } from "@/hooks/useDashboardMetrics";
import { useNavigate } from "react-router-dom";
import dashboardArt from "@/assets/dashboard-art.png";
import SetupChecklist from "@/components/SetupChecklist";
import OnboardingModal from "@/components/OnboardingModal";

const FUNNEL_COLORS = [
  "hsl(var(--primary))",
  "hsl(199, 89%, 48%)",
  "hsl(262, 60%, 55%)",
  "hsl(38, 92%, 50%)",
  "hsl(152, 69%, 40%)",
];

const chartTooltipStyle = {
  backgroundColor: "hsl(222, 47%, 9%)",
  border: "1px solid hsl(222, 30%, 18%)",
  borderRadius: "8px",
  color: "hsl(210, 40%, 96%)",
};

const ConversionFunnel = ({ data }: { data: FunnelStep[] }) => {
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="space-y-1">
      {data.map((step, i) => {
        const widthPct = Math.max((step.value / maxValue) * 100, 4);
        const prevValue = i > 0 ? data[i - 1].value : null;
        const conversionPct = prevValue && prevValue > 0
          ? Math.round((step.value / prevValue) * 100)
          : null;

        return (
          <div key={step.name}>
            {conversionPct !== null && (
              <div className="flex items-center gap-2 pl-2 py-0.5">
                <span className="text-xs text-muted-foreground">
                  → {conversionPct}% converteram
                </span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground w-40 shrink-0 text-right">
                {step.name}
              </span>
              <div className="flex-1 relative h-8">
                <div
                  className="h-full rounded-md transition-all duration-500"
                  style={{
                    width: `${widthPct}%`,
                    backgroundColor: FUNNEL_COLORS[i % FUNNEL_COLORS.length],
                    opacity: 0.85,
                  }}
                />
              </div>
              <span className="text-sm font-semibold w-12 text-right tabular-nums">
                {step.value}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const Dashboard = () => {
  const { profile } = useAuth();
  const { data: metrics, isLoading, isError, refetch } = useDashboardMetrics();
  const navigate = useNavigate();

  return (
    <>
      <OnboardingModal />
      <SEO title="Dashboard" description="Visão geral da sua prospecção de leads e métricas de performance." />

      {/* Welcome banner */}
      <section
        className="relative rounded-xl overflow-hidden p-8 mb-8 animate-fade-in"
        style={{ backgroundImage: `url(${dashboardArt})`, backgroundSize: "cover", backgroundPosition: "center" }}
        role="banner"
      >
        <div className="absolute inset-0 bg-background/75 backdrop-blur-sm" />
        <div className="relative z-10">
          <h1 className="text-3xl font-bold tracking-tight">
            Olá, {profile?.full_name || "Usuário"} 👋
          </h1>
          <p className="text-muted-foreground mt-1 max-w-lg">
            Acompanhe suas métricas de prospecção e gerencie seu pipeline de forma inteligente.
          </p>
        </div>
      </section>

      <SetupChecklist />

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading ? (
        <LoadingState variant="page" count={5} />
      ) : !metrics?.hasData ? (
        <EmptyState
          icon={TrendingUp}
          title="Nenhum dado ainda"
          description="Comece criando sua agência e adicionando leads ao pipeline para ver suas métricas aqui."
          action={{ label: "Configurar agência", onClick: () => navigate("/context") }}
        />
      ) : (
        <>
          {/* KPIs */}
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-8 animate-fade-in" aria-label="Indicadores-chave">
            <StatCard label="Leads Gerados" value={metrics.leadsThisMonth} icon={Users} />
            <StatCard label="Taxa de Resposta" value={`${metrics.responseRate}%`} icon={MessageSquare} />
            <StatCard label="Saldo de Créditos" value={metrics.creditsBalance} icon={Zap} />
          </section>

          {/* Funnel */}
          <section className="mb-8 animate-fade-in" aria-label="Funil de conversão">
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Funil de conversão</CardTitle>
              </CardHeader>
              <CardContent>
                {metrics.funnelData.some((d) => d.value > 0) ? (
                  <ConversionFunnel data={metrics.funnelData} />
                ) : (
                  <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
                    Sem dados de funil ainda
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          {/* Credits usage */}
          <section className="mb-8 animate-fade-in" aria-label="Consumo de créditos">
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Consumo de créditos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48">
                  {metrics.creditsUsage.some((d) => d.consumed > 0) ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={metrics.creditsUsage}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 30%, 18%)" />
                        <XAxis dataKey="name" stroke="hsl(215, 20%, 55%)" fontSize={12} />
                        <YAxis stroke="hsl(215, 20%, 55%)" fontSize={12} />
                        <Tooltip contentStyle={chartTooltipStyle} />
                        <Bar dataKey="consumed" fill="hsl(262, 60%, 55%)" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                      Nenhum crédito consumido ainda
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </>
  );
};

export default Dashboard;
