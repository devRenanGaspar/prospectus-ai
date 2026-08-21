import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import SEO from "@/components/SEO";
import PageHeader from "@/components/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  User, Globe, CreditCard,
  MessageSquare, Calendar, Mail, ExternalLink,
  Shield, Download, Trash2, AlertTriangle, Phone, CheckCircle2, XCircle, Loader2,
  LifeBuoy,
} from "lucide-react";
import SupportCard from "@/components/SupportCard";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useWhatsApp } from "@/hooks/useWhatsApp";
import { useRequestAccountDeletion } from "@/hooks/useAccountDeletion";
import { useCurrentSubscription, usePlans } from "@/hooks/usePlans";
import {
  fetchAllRows,
  PROFILE_COLUMNS,
  USER_DATA_TABLES,
} from "@/lib/user-data-tables";
import { Link, useSearchParams } from "react-router-dom";

/**
 * The consents the user can actually decide.
 *
 * `analytics` is scoped to the app on purpose, and the label says so. The
 * public site loads Google Tag Manager before anyone signs in, so no
 * logged-in switch can govern it -- that measurement is disclosed in section 7
 * of the privacy policy instead. Claiming this switch covered "platform usage"
 * generally would be the same defect the switch is being fixed for.
 */
const CONSENTS = [
  {
    id: "marketing",
    label: "Comunicações de marketing",
    desc: "Receba novidades e ofertas por email.",
    defaultValue: false,
  },
  {
    id: "analytics",
    label: "Telemetria de uso dentro do aplicativo",
    desc: "Métricas anônimas de navegação e desempenho enquanto você usa a plataforma. Não abrange o site público — veja a seção 7 da Política de Privacidade.",
    defaultValue: true,
  },
] as const;

const Settings = () => {
  const { profile, user, refreshProfile } = useAuth();

  // The billing card reads its plan instead of stating one. `subscriptions`
  // is the authority when a row exists; `profile.plan_id` is the fallback,
  // because production has 66 profiles with a plan against 62 subscription
  // rows -- four accounts whose plan lives only on the profile, and which the
  // subscription query alone would render as "no plan".
  const subscriptionQuery = useCurrentSubscription();
  const plansQuery = usePlans();
  const subscription = subscriptionQuery.data ?? null;
  const planFromProfile = profile?.plan_id
    ? plansQuery.data?.find((p) => p.id === profile.plan_id) ?? null
    : null;
  const currentPlan =
    (subscription?.plans as { name: string; credits_included: number } | null) ?? planFromProfile;
  const billingStatus: "loading" | "error" | "ready" =
    subscriptionQuery.isLoading || plansQuery.isLoading
      ? "loading"
      : subscriptionQuery.isError || plansQuery.isError
        ? "error"
        : "ready";
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const requestDeletion = useRequestAccountDeletion();
  const [exportLoading, setExportLoading] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [saving, setSaving] = useState(false);
  const [consents, setConsents] = useState<Record<string, boolean>>(
    () => profile?.lgpd_consents ?? {},
  );
  const [consentSaving, setConsentSaving] = useState(false);

  const saveConsent = async (id: string, next: boolean) => {
    if (!user) return;
    const previous = consents;
    const merged = { ...previous, [id]: next };
    setConsents(merged);
    setConsentSaving(true);
    // `lgpd_consents_updated_at` is written with it, not as decoration: LGPD
    // art. 8 §1 puts the burden of *demonstrating* consent on the controller,
    // and a boolean with no timestamp demonstrates nothing.
    const { error } = await supabase
      .from("profiles")
      .update({ lgpd_consents: merged, lgpd_consents_updated_at: new Date().toISOString() })
      .eq("id", user.id);
    setConsentSaving(false);
    if (error) {
      setConsents(previous);
      toast.error("Não foi possível salvar sua escolha. Tente novamente.");
      return;
    }
    // Refreshing the profile is what makes the choice take effect: the
    // telemetry gate reads `lgpd_consents.analytics` from it.
    await refreshProfile();
    toast.success("Preferência de privacidade salva.");
  };

  const whatsapp = useWhatsApp();

  useEffect(() => {
    setFullName(profile?.full_name || "");
  }, [profile?.full_name]);

  // Handle Google Calendar callback
  useEffect(() => {
    const gcResult = searchParams.get("google_calendar");
    if (gcResult === "success") {
      toast.success("Google Calendar conectado com sucesso!");
      refreshProfile();
      const nextSearchParams = new URLSearchParams(searchParams);
      nextSearchParams.delete("google_calendar");
      setSearchParams(nextSearchParams, { replace: true });
    } else if (gcResult === "error") {
      toast.error("Erro ao conectar Google Calendar. Tente novamente.");
      const nextSearchParams = new URLSearchParams(searchParams);
      nextSearchParams.delete("google_calendar");
      nextSearchParams.delete("reason");
      setSearchParams(nextSearchParams, { replace: true });
    }
  }, [refreshProfile, searchParams, setSearchParams]);

  const handleConnectGoogleCalendar = async () => {
    setCalendarLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const { data, error } = await supabase.functions.invoke("google-calendar-auth-url", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { origin: window.location.origin },
      });
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      toast.error("Erro ao iniciar conexão com Google Calendar.");
      console.error(err);
    } finally {
      setCalendarLoading(false);
    }
  };

  const handleDisconnectGoogleCalendar = async () => {
    if (!user) return;
    setCalendarLoading(true);
    try {
      const { error } = await supabase.functions.invoke("google-calendar-disconnect");
      if (error) throw error;
      await refreshProfile();
      toast.success("Google Calendar desconectado.");
    } catch {
      toast.error("Erro ao desconectar Google Calendar.");
    } finally {
      setCalendarLoading(false);
    }
  };

  const handleExportData = async () => {
    if (!user) return;
    setExportLoading(true);
    try {
      const profileRes = await supabase
        .from("profiles")
        .select(PROFILE_COLUMNS)
        .eq("id", user.id)
        .single();
      if (profileRes.error) throw new Error(`profiles: ${profileRes.error.message}`);

      // Sequential, not Promise.all. Nine tables paginated at 1,000 rows each
      // can be dozens of requests for a large account, and firing them all at
      // once is how an export starts failing on rate limits for exactly the
      // users with the most data to export.
      const tables: Record<string, unknown[]> = {};
      for (const spec of USER_DATA_TABLES) {
        tables[spec.table] = await fetchAllRows(
          (from, to) => {
            const query = supabase
              .from(spec.table as "leads")
              .select(spec.columns)
              .order(spec.orderBy)
              .range(from, to);
            // `messages` and `lead_comments` have no user_id column; their RLS
            // policy scopes them through the caller's leads already.
            return spec.scope === "user_id" ? query.eq("user_id", user.id) : query;
          },
          spec.table,
        );
      }

      const exportData = {
        exported_at: new Date().toISOString(),
        // Stated in the file itself, so the omission travels with the export
        // rather than living only in a label the user saw once.
        escopo: "Dados da sua conta. O texto das mensagens trocadas com os leads nao esta incluido: o que o lead escreveu e dado de terceiro.",
        profile: profileRes.data,
        ...tables,
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `prospectus-dados-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Dados exportados com sucesso!");
    } catch (error) {
      // Reported rather than swallowed. Every query above throws on `error`,
      // where the previous version destructured `{ data }` alone -- a failed
      // read became `null` in the JSON and the user still saw the success
      // toast, then downloaded a file that said they had no leads.
      console.error("handleExportData failed:", error);
      toast.error("Erro ao exportar dados. Nenhum arquivo foi gerado.");
    } finally {
      setExportLoading(false);
    }
  };

  const handleDeleteRequest = async () => {
    try {
      await requestDeletion.mutateAsync();
      setShowDeleteDialog(false);
    } catch {
      // The hook already reported it; keep the dialog open so the user can retry.
    }
  };

  return (
    <>
      <SEO title="Configurações" description="Gerencie seu perfil, integrações e preferências da plataforma." />
      <PageHeader
        title="Configurações"
        description="Gerencie sua conta e preferências."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Configurações" }]}
      />

      <Tabs
        value={searchParams.get("tab") ?? "profile"}
        onValueChange={(v) => {
          searchParams.set("tab", v);
          setSearchParams(searchParams, { replace: true });
        }}
        className="animate-fade-in"
      >
        <TabsList className="mb-6 bg-secondary/50">
          <TabsTrigger value="profile" className="gap-2">
            <User className="h-4 w-4" />
            Perfil
          </TabsTrigger>
          <TabsTrigger value="integrations" className="gap-2">
            <Globe className="h-4 w-4" />
            Integrações
          </TabsTrigger>
          <TabsTrigger value="billing" className="gap-2">
            <CreditCard className="h-4 w-4" />
            Faturamento
          </TabsTrigger>
          <TabsTrigger value="privacy" className="gap-2">
            <Shield className="h-4 w-4" />
            Privacidade
          </TabsTrigger>
          <TabsTrigger value="support" className="gap-2">
            <LifeBuoy className="h-4 w-4" />
            Suporte
          </TabsTrigger>
        </TabsList>

        {/* Profile */}
        <TabsContent value="profile">
          <Card className="border-border/50 max-w-2xl">
            <CardHeader>
              <CardTitle className="text-lg">Informações pessoais</CardTitle>
              <CardDescription>Atualize seu nome e informações de perfil.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome completo</Label>
                <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Seu nome" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email-display">Email</Label>
                <Input id="email-display" disabled value={user?.email ?? "email@exemplo.com"} className="opacity-60" />
                <p className="text-xs text-muted-foreground">O email não pode ser alterado.</p>
              </div>
              <Button
                variant="premium"
                className="mt-2"
                disabled={saving}
                onClick={async () => {
                  if (!user) return;
                  setSaving(true);
                  try {
                    const { error } = await supabase
                      .from("profiles")
                      .update({ full_name: fullName.trim() })
                      .eq("id", user.id);
                    if (error) throw error;
                    await refreshProfile();
                    toast.success("Perfil atualizado com sucesso!");
                  } catch {
                    toast.error("Erro ao salvar alterações.");
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                Salvar alterações
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Integrations */}
        <TabsContent value="integrations">
          <div className="grid gap-4 max-w-3xl">
            {/* WhatsApp - Functional */}
            <Card className="border-border/50">
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <div className="shrink-0 rounded-lg bg-primary/10 p-2.5">
                    <MessageSquare className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium">WhatsApp</h3>
                      <Badge
                        variant={whatsapp.status === "active" ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {whatsapp.status === "active"
                          ? "Conectado"
                          : whatsapp.status === "pending"
                            ? "Pendente"
                            : "Desconectado"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      Conecte seu WhatsApp para enviar e receber mensagens de leads.
                    </p>

                    <div className="mb-4 flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
                      <ul className="space-y-1.5 text-xs text-muted-foreground leading-relaxed">
                        <li>
                          Use um <span className="font-medium text-foreground">WhatsApp Business</span> com número exclusivo para prospecção.
                        </li>
                        <li>
                          O risco de bloqueio é o mesmo de uma prospecção manual — recomendamos prospectar até{" "}
                          <span className="font-medium text-foreground">30 leads por dia</span>.
                        </li>
                      </ul>
                    </div>

                    {whatsapp.status === "active" ? (
                      /* Connected state */
                      <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50 border border-border/50">
                        {whatsapp.connectedPhoto ? (
                          <img
                            src={whatsapp.connectedPhoto}
                            alt="WhatsApp"
                            className="h-12 w-12 rounded-full object-cover border-2 border-primary/20"
                          />
                        ) : (
                          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                            <Phone className="h-5 w-5 text-primary" />
                          </div>
                        )}
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                            <span className="font-medium text-sm">Conexão ativa</span>
                          </div>
                          <p className="text-sm text-muted-foreground">{whatsapp.connectedNumber}</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={whatsapp.disconnect}
                          disabled={whatsapp.loading}
                          className="text-destructive border-destructive/30 hover:bg-destructive/10"
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Desconectar
                        </Button>
                      </div>
                    ) : whatsapp.status === "pending" ? (
                      /* Pending state - instance created, waiting for connection */
                      <div className="space-y-3">
                        <div className="flex items-center gap-4 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                          <div className="h-12 w-12 rounded-full bg-yellow-500/10 flex items-center justify-center">
                            <Phone className="h-5 w-5 text-yellow-600" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <AlertTriangle className="h-4 w-4 text-yellow-600" />
                              <span className="font-medium text-sm">Instância criada, aguardando conexão</span>
                            </div>
                            <p className="text-sm text-muted-foreground">{whatsapp.connectedNumber}</p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={whatsapp.checkStatus}
                              disabled={whatsapp.loading}
                            >
                              {whatsapp.loading ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                              ) : (
                                <CheckCircle2 className="h-4 w-4 mr-1" />
                              )}
                              Verificar conexão
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={whatsapp.disconnect}
                              disabled={whatsapp.loading}
                              className="text-destructive border-destructive/30 hover:bg-destructive/10"
                            >
                              <XCircle className="h-4 w-4 mr-1" />
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Disconnected state */
                      <div className="flex items-end gap-3">
                        <div className="flex-1 space-y-2">
                          <Label htmlFor="whatsapp-phone">Número de telefone</Label>
                          <Input
                            id="whatsapp-phone"
                            value={phoneInput}
                            onChange={(e) => setPhoneInput(e.target.value)}
                            placeholder="+55 11 99999-9999"
                            disabled={whatsapp.loading}
                          />
                        </div>
                        <Button
                          onClick={() => whatsapp.connect(phoneInput)}
                          disabled={whatsapp.loading || !phoneInput.trim()}
                        >
                          {whatsapp.loading ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          ) : (
                            <Phone className="h-4 w-4 mr-1" />
                          )}
                          Conectar
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Google Calendar */}
            <Card className="border-border/50">
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <div className="shrink-0 rounded-lg bg-primary/10 p-2.5">
                    <Calendar className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium">Google Calendar</h3>
                      <Badge
                        variant={profile?.google_calendar_email ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {profile?.google_calendar_email ? "Conectado" : "Desconectado"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      Permita que seu agente SDR verifique sua agenda para agendar reuniões com leads. O uso de dados brutos ou derivados recebidos das APIs do Workspace obedecerá à Política de Dados do Usuário do Google, incluindo os requisitos de Uso Limitado.
                    </p>

                    {profile?.google_calendar_email ? (
                      <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50 border border-border/50">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Calendar className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                            <span className="font-medium text-sm">Conexão ativa</span>
                          </div>
                          <p className="text-sm text-muted-foreground">{profile.google_calendar_email}</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleDisconnectGoogleCalendar}
                          disabled={calendarLoading}
                          className="text-destructive border-destructive/30 hover:bg-destructive/10"
                        >
                          {calendarLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <XCircle className="h-4 w-4 mr-1" />}
                          Desconectar
                        </Button>
                      </div>
                    ) : (
                      <Button
                        onClick={handleConnectGoogleCalendar}
                        disabled={calendarLoading}
                        variant="outline"
                        size="sm"
                      >
                        {calendarLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Calendar className="h-4 w-4 mr-1" />}
                        Conectar Google Calendar
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Outlook - Coming soon */}
            <Card className="border-border/50">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="shrink-0 rounded-lg bg-primary/10 p-2.5">
                  <Mail className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="font-medium">Outlook</h3>
                    <Badge variant="secondary" className="text-xs">Em breve</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">Integre com seu calendário e email Outlook.</p>
                </div>
                <Button variant="outline" size="sm" disabled className="shrink-0">
                  Conectar
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Billing */}
        <TabsContent value="billing">
          <Card className="border-border/50 max-w-2xl">
            <CardHeader>
              <CardTitle className="text-lg">Plano atual</CardTitle>
              <CardDescription>Gerencie sua assinatura e dados de pagamento.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Loading and failure are rendered as themselves, not defaulted
                  to "Trial" while the query is in flight -- a default here
                  would misrepresent every paying customer's plan for the
                  width of that window, the same failure shape the telemetry
                  consent gate exists to avoid. */}
              {billingStatus === "loading" ? (
                <div className="flex items-center gap-2 p-4 rounded-lg bg-muted/50 border border-border/50 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando seu plano...
                </div>
              ) : billingStatus === "error" ? (
                <div className="flex items-center gap-2 p-4 rounded-lg bg-muted/50 border border-destructive/40 text-sm text-muted-foreground">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  Não foi possível carregar seu plano. Recarregue a página ou fale com o suporte.
                </div>
              ) : currentPlan ? (
                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border border-border/50">
                  <div>
                    <p className="font-medium">Plano {currentPlan.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {currentPlan.credits_included} créditos inclusos
                    </p>
                  </div>
                  <Badge variant="outline">
                    {subscription?.status === "active"
                      ? "Ativo"
                      : subscription?.status ?? "Sem assinatura"}
                  </Badge>
                </div>
              ) : (
                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border border-border/50">
                  <div>
                    <p className="font-medium">Nenhum plano ativo</p>
                    <p className="text-sm text-muted-foreground">
                      Escolha um plano para liberar créditos mensais.
                    </p>
                  </div>
                  <Badge variant="outline">Inativo</Badge>
                </div>
              )}
              <Button variant="premium" asChild>
                <a href="/billing/plans">
                  Ver planos disponíveis
                  <ExternalLink className="h-4 w-4 ml-2" />
                </a>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* The Preferences tab is gone. Its three switches -- e-mail
            notifications, weekly digest, notification sounds -- had no
            handler and no consumer: there is no notification system behind
            them to configure, so persisting them would only have created a
            second dead field. They come back when something reads them. */}

        {/* Privacy / LGPD */}
        <TabsContent value="privacy">
          <div className="space-y-6 max-w-2xl">
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />
                  Privacidade e Dados (LGPD)
                </CardTitle>
                <CardDescription>
                  Gerencie seus dados pessoais de acordo com a Lei Geral de Proteção de Dados.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border border-border/50">
                  <div>
                    <p className="font-medium text-sm">Exportar meus dados</p>
                    <p className="text-xs text-muted-foreground">Baixe uma cópia dos dados da sua conta em JSON: perfil, leads, buscas, cobranças, assinaturas, comentários e o histórico de mensagens sem o texto escrito pelos leads.</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleExportData} disabled={exportLoading}>
                    <Download className="h-4 w-4 mr-2" />
                    {exportLoading ? "Exportando..." : "Exportar"}
                  </Button>
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg bg-destructive/5 border border-destructive/20">
                  <div>
                    <p className="font-medium text-sm">Excluir minha conta</p>
                    <p className="text-xs text-muted-foreground">Solicite a exclusão permanente de todos os seus dados.</p>
                  </div>
                  <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => setShowDeleteDialog(true)}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Solicitar exclusão
                  </Button>
                </div>

                <Separator />

                <div className="space-y-3">
                  <h4 className="font-medium text-sm">Consentimentos</h4>

                  {/* Processing for prospecting is not a consent: it is the
                      execution of the contract the user signed up for (LGPD
                      art. 7, II). It used to appear here as a switch that was
                      permanently on and permanently disabled, which framed a
                      legal basis the user cannot decline as a choice. */}
                  <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                    <p className="text-sm font-medium">Processamento de dados para prospecção</p>
                    <p className="text-xs text-muted-foreground">
                      Base legal: execução do contrato. Não depende de consentimento e não
                      pode ser desativado enquanto a conta estiver ativa.
                    </p>
                  </div>

                  <div className="space-y-3">
                    {CONSENTS.map((consent) => (
                      <div key={consent.id} className="flex items-center justify-between">
                        <div className="pr-4">
                          <p className="text-sm font-medium">{consent.label}</p>
                          <p className="text-xs text-muted-foreground">{consent.desc}</p>
                        </div>
                        <Switch
                          checked={consents[consent.id] ?? consent.defaultValue}
                          disabled={consentSaving}
                          onCheckedChange={(next) => saveConsent(consent.id, next)}
                          aria-label={consent.label}
                        />
                      </div>
                    ))}
                  </div>

                  {profile?.lgpd_consents_updated_at && (
                    <p className="text-xs text-muted-foreground">
                      Última atualização dos consentimentos:{" "}
                      {new Date(profile.lgpd_consents_updated_at).toLocaleString("pt-BR")}
                    </p>
                  )}
                </div>

                <p className="text-xs text-muted-foreground">
                  Para mais informações sobre como tratamos seus dados, consulte nossa{" "}
                  <Link to="/privacy" className="text-primary hover:underline">
                    Política de Privacidade
                  </Link>
                  .
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Support */}
        <TabsContent value="support">
          <SupportCard />
        </TabsContent>
      </Tabs>

      {/* QR Code Dialog */}
      <Dialog open={whatsapp.showQrDialog} onOpenChange={whatsapp.setShowQrDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Conectar WhatsApp
            </DialogTitle>
            <DialogDescription>
              Entre o pairing code no seu WhatsApp ou conecte lendo o QR Code. Em seguida clique em "Fechar" e aguarde a conexão ser concluída.
            </DialogDescription>
          </DialogHeader>

          {whatsapp.qrData && (
            <div className="space-y-4">
              {/* QR Code */}
              <div className="flex justify-center">
                <img
                  src={whatsapp.qrData.base64}
                  alt="QR Code WhatsApp"
                  className="w-64 h-64 rounded-lg border border-border/50"
                />
              </div>

              {/* Pairing Code */}
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1">Pairing Code</p>
                <p className="text-2xl font-mono font-bold tracking-widest text-primary">
                  {whatsapp.qrData.pairingCode}
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="sm:justify-center">
            <Button
              onClick={() => {
                whatsapp.setShowQrDialog(false);
                whatsapp.checkStatus();
              }}
              disabled={whatsapp.loading}
            >
              {whatsapp.loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Fechar e verificar conexão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete account dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Solicitar exclusão de conta
            </DialogTitle>
            <DialogDescription>
              Vamos registrar sua solicitação e confirmar o recebimento em até 48h. A exclusão
              de todos os seus dados, leads, mensagens e configurações é concluída em até 30
              dias, salvo obrigação legal de retenção. Enquanto não for concluída, você pode
              cancelar falando com o suporte.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)} disabled={requestDeletion.isPending}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDeleteRequest} disabled={requestDeletion.isPending}>
              {requestDeletion.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Solicitar exclusão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Settings;
