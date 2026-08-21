import SEO from "@/components/SEO";
import PageHeader from "@/components/PageHeader";
import LoadingState from "@/components/LoadingState";
import ErrorState from "@/components/ErrorState";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Zap, Crown, CreditCard } from "lucide-react";
import { usePlans, useCurrentSubscription, useCreditPackages } from "@/hooks/usePlans";
import { useCreditBalance } from "@/hooks/useCreditBalance";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const PLAN_ICONS: Record<string, typeof Crown> = { Trial: Zap, Básico: CreditCard, Avançado: Crown };

const openLink = (link: string | null | undefined, fallback: string) => {
  if (link) {
    window.open(link, "_blank");
  } else {
    toast.info(fallback);
  }
};

const BillingPlans = () => {
  const { profile } = useAuth();
  const { data: plans = [], isLoading, isError, refetch } = usePlans();
  const { data: subscription } = useCurrentSubscription();
  const { data: credits } = useCreditBalance();
  const { data: creditPackages = [], isLoading: pkgLoading } = useCreditPackages();
  const activePlans = plans.filter((p) => p.is_active);

  const currentPlanId = profile?.plan_id || subscription?.plan_id;
  const recommendedIdx = activePlans.length >= 2 ? 1 : 0;

  return (
    <>
      <SEO title="Planos" description="Escolha o plano ideal para escalar sua prospecção." />
      <PageHeader
        title="Planos e Assinatura"
        description="Escolha o plano ideal para sua operação."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Planos" }]}
      />

      {/* Current subscription summary */}
      <Card className="border-border/50 mb-8 animate-fade-in">
        <CardContent className="flex flex-wrap items-center gap-6 py-5">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Plano atual</p>
            <p className="text-lg font-semibold">{subscription ? subscription.plans?.name ?? "—" : "Trial"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Status</p>
            <Badge variant={subscription?.status === "active" ? "success" : "secondary"}>
              {subscription?.status === "active" ? "Ativo" : "Trial"}
            </Badge>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Saldo</p>
            <p className="text-lg font-semibold flex items-center gap-1">
              <Zap className="h-4 w-4 text-primary" />
              {credits ?? profile?.credits_balance ?? 0} créditos
            </p>
          </div>
          {subscription?.current_period_end && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Próxima renovação</p>
              <p className="text-sm">{new Date(subscription.current_period_end).toLocaleDateString("pt-BR")}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading ? (
        <LoadingState variant="cards" count={3} />
      ) : (
        <div className="grid gap-6 md:grid-cols-3 max-w-4xl animate-fade-in">
          {activePlans.map((plan, idx) => {
            const isHighlighted = idx === recommendedIdx;
            const isCurrent = plan.id === currentPlanId;
            const Icon = PLAN_ICONS[plan.name] ?? Zap;

            return (
              <Card
                key={plan.id}
                className={`relative transition-all duration-300 hover:scale-[1.02] ${
                  isHighlighted ? "border-primary/50 shadow-elegant" : "border-border/50"
                }`}
              >
                {isHighlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge variant="default" className="gradient-primary border-0">Mais popular</Badge>
                  </div>
                )}
                <CardHeader className="text-center pb-2 pt-6">
                  <div className="mx-auto mb-3 h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  <div className="mt-2">
                    <span className="text-3xl font-bold">
                      {plan.price_monthly === 0 ? "Grátis" : `R$ ${plan.price_monthly}`}
                    </span>
                    {plan.price_monthly > 0 && <span className="text-muted-foreground text-sm">/mês</span>}
                  </div>
                  <CardDescription className="mt-1">
                    {plan.credits_included.toLocaleString("pt-BR")} créditos inclusos
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2.5">
                    {(plan.features ?? []).map((feature) => (
                      <li key={feature} className="flex items-center gap-2 text-sm">
                        <Check className="h-4 w-4 text-success shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Button
                    variant={isHighlighted ? "premium" : "outline"}
                    className="w-full"
                    disabled={isCurrent}
                    onClick={() => openLink(plan.payment_link, "Link de pagamento não configurado. Entre em contato.")}
                  >
                    {isCurrent ? "Plano atual" : "Assinar"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Extra credits section */}
      <section className="mt-12 max-w-4xl animate-fade-in">
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base">Créditos avulsos</CardTitle>
            <CardDescription>Precisa de mais créditos? Compre pacotes adicionais sem mudar de plano.</CardDescription>
          </CardHeader>
          <CardContent>
            {pkgLoading ? (
              <LoadingState variant="cards" count={3} />
            ) : creditPackages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum pacote disponível no momento.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-3">
                {creditPackages.map((pkg) => (
                  <Card key={pkg.id} className="border-border/30 text-center p-4 hover:border-primary/30 transition-colors cursor-pointer">
                    <p className="text-2xl font-bold">{pkg.credits}</p>
                    <p className="text-xs text-muted-foreground mb-3">créditos</p>
                    <p className="text-lg font-semibold mb-3">R$ {pkg.price}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => openLink(pkg.payment_link, "Link de pagamento não configurado. Entre em contato.")}
                    >
                      Comprar
                    </Button>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </>
  );
};

export default BillingPlans;
