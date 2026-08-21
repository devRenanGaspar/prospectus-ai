import { Link } from "react-router-dom";
import {
  Zap,
  MessageSquare,
  Calendar,
  CheckCircle2,
  ArrowRight,
  Search,
  Bot,
  Sparkles,
  KanbanSquare,
  ShieldCheck,
  Clock,
  TrendingUp,
  Users,
  Target,
  Rocket,
  Star,
} from "lucide-react";
import SEO from "@/components/SEO";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const features = [
  {
    icon: Search,
    title: "Descoberta de leads com IA",
    description:
      "Encontre empresas qualificadas por nicho e localização em segundos. Dados enriquecidos com WhatsApp, Instagram, site e CNPJ.",
  },
  {
    icon: Sparkles,
    title: "Copy personalizada por lead",
    description:
      "A IA gera mensagens de abordagem únicas para cada empresa, com base no contexto da sua agência e do prospect.",
  },
  {
    icon: Bot,
    title: "Agente SDR autônomo",
    description:
      "Um SDR de IA conversa com seus leads no WhatsApp 24/7, qualifica e agenda reuniões direto na sua agenda.",
  },
  {
    icon: KanbanSquare,
    title: "Kanban de prospecção",
    description:
      "Acompanhe cada lead em tempo real: novo, contatado, respondeu, qualificado, agendado, perdido. Tudo em um só lugar.",
  },
  {
    icon: Calendar,
    title: "Integração Google Calendar",
    description:
      "O agente checa sua disponibilidade real e sugere horários sem conflito. Reunião marcada com convite automático.",
  },
  {
    icon: MessageSquare,
    title: "WhatsApp nativo",
    description:
      "Conexão via QR Code em segundos. Envia, recebe e centraliza todas as conversas dos leads no painel.",
  },
];

const steps = [
  {
    icon: Target,
    title: "Configure sua agência",
    description:
      "Em poucos minutos, defina seu ICP, persona, qualificação e tom de voz. A IA aprende como sua agência vende.",
  },
  {
    icon: Search,
    title: "Descubra leads",
    description:
      "Escolha nicho e cidade. O sistema entrega listas de empresas qualificadas com todos os dados de contato.",
  },
  {
    icon: Rocket,
    title: "Dispare abordagem",
    description:
      "A IA gera copy personalizada e envia via WhatsApp. Você acompanha tudo pelo Kanban em tempo real.",
  },
  {
    icon: Calendar,
    title: "Agende reuniões",
    description:
      "O SDR de IA qualifica os interessados e agenda na sua agenda do Google. Você só entra para fechar.",
  },
];

const benefits = [
  "Pare de perder horas garimpando leads no Google",
  "Aborde 10x mais empresas com a mesma equipe",
  "Mensagens personalizadas, não spam genérico",
  "Reuniões agendadas no piloto automático",
  "Pipeline visível em tempo real",
  "Sem instalar nada — tudo na nuvem",
];

const Landing = () => (
  <>
    <SEO
      title="Prospectus — Prospecção B2B com IA no WhatsApp"
      description="Encontre, aborde e qualifique leads no automático. Descoberta por nicho, copy personalizada por IA, SDR autônomo e agendamento via Google Calendar. Para agências e times comerciais."
      canonical="https://prospectus.ia.br/"
    />
    <Helmet>
      <script>{`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-N3RPMF7G');`}</script>
    </Helmet>
    <noscript>
      <iframe
        src="https://www.googletagmanager.com/ns.html?id=GTM-N3RPMF7G"
        height="0"
        width="0"
        style={{ display: "none", visibility: "hidden" }}
      />
    </noscript>
    <div className="min-h-screen bg-background">

      {/* Header */}
      <header className="border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl gradient-primary flex items-center justify-center shadow-soft">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg tracking-tight">Prospectus</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6">
            <a href="#features" className="text-sm text-muted-foreground hover:text-primary transition-colors">
              Recursos
            </a>
            <a href="#how" className="text-sm text-muted-foreground hover:text-primary transition-colors">
              Como funciona
            </a>
            <a href="#pricing" className="text-sm text-muted-foreground hover:text-primary transition-colors">
              Planos
            </a>
            <a href="#faq" className="text-sm text-muted-foreground hover:text-primary transition-colors">
              FAQ
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="text-sm text-muted-foreground hover:text-primary transition-colors hidden sm:inline-block"
            >
              Entrar
            </Link>
            <Button asChild variant="premium" size="sm">
              <Link to="/login">
                Começar grátis
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative py-20 md:py-32 px-6 overflow-hidden">
        <div className="absolute inset-0 gradient-subtle opacity-50" aria-hidden />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[800px] rounded-full opacity-20 blur-3xl gradient-primary"
          aria-hidden
        />
        <div className="relative max-w-5xl mx-auto text-center">
          <Badge variant="outline" className="mb-6 border-primary/30 bg-primary/5 text-primary">
            <Sparkles className="h-3 w-3 mr-1.5" />
            Prospecção B2B com Inteligência Artificial
          </Badge>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6 leading-[1.05]">
            Encha sua agenda de{" "}
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              reuniões qualificadas
            </span>{" "}
            no automático
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed mb-10">
            O Prospectus encontra empresas do seu nicho, gera mensagens personalizadas por IA, conversa com os
            leads no WhatsApp e agenda reuniões direto na sua agenda. Tudo enquanto você dorme.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-12">
            <Button asChild variant="premium" size="lg" className="w-full sm:w-auto">
              <Link to="/login">
                Começar grátis
                <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
              <a href="#how">Ver como funciona</a>
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Teste grátis com créditos inclusos
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Sem cartão de crédito
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Configure em minutos
            </span>
          </div>
        </div>
      </section>

      {/* Problem/Solution */}
      <section className="py-16 md:py-24 px-6 border-t border-border/50">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-8 items-start">
            <div>
              <Badge variant="outline" className="mb-4 border-destructive/30 bg-destructive/5 text-destructive">
                O problema
              </Badge>
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-6">
                Prospecção manual está matando o seu time
              </h2>
              <ul className="space-y-3 text-muted-foreground">
                <li className="flex items-start gap-3">
                  <span className="h-1.5 w-1.5 rounded-full bg-destructive mt-2.5 shrink-0" />
                  <span>Horas perdidas garimpando empresas no Google e Instagram</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="h-1.5 w-1.5 rounded-full bg-destructive mt-2.5 shrink-0" />
                  <span>Mensagens copiadas e coladas que ninguém responde</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="h-1.5 w-1.5 rounded-full bg-destructive mt-2.5 shrink-0" />
                  <span>Leads esquecidos em planilhas e conversas dispersas</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="h-1.5 w-1.5 rounded-full bg-destructive mt-2.5 shrink-0" />
                  <span>Agenda de reuniões sempre vazia no fim do mês</span>
                </li>
              </ul>
            </div>
            <div>
              <Badge variant="outline" className="mb-4 border-primary/30 bg-primary/5 text-primary">
                A solução
              </Badge>
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-6">
                Um time de SDR de IA trabalhando 24/7
              </h2>
              <ul className="space-y-3">
                {benefits.map((b) => (
                  <li key={b} className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-16 md:py-24 px-6 border-t border-border/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <Badge variant="outline" className="mb-4 border-primary/30 bg-primary/5 text-primary">
              Recursos
            </Badge>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
              Tudo que você precisa para vender mais
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Da descoberta do lead à reunião agendada, sem trocar de ferramenta.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <Card key={f.title} className="border-border/60 hover:border-primary/40 transition-colors group">
                <CardContent className="p-6 space-y-4">
                  <div className="h-12 w-12 rounded-xl gradient-primary flex items-center justify-center shadow-soft group-hover:shadow-elegant transition-shadow">
                    <f.icon className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <h3 className="font-semibold text-lg">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="py-16 md:py-24 px-6 border-t border-border/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <Badge variant="outline" className="mb-4 border-primary/30 bg-primary/5 text-primary">
              Como funciona
            </Badge>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
              Da configuração à reunião em 4 passos
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Você configura uma vez. A IA trabalha todos os dias.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map((s, i) => (
              <div key={s.title} className="relative">
                <Card className="h-full border-border/60">
                  <CardContent className="p-6 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                        {i + 1}
                      </div>
                      <s.icon className="h-5 w-5 text-accent" />
                    </div>
                    <h3 className="font-semibold text-lg">{s.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{s.description}</p>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats / Social proof */}
      <section className="py-16 md:py-20 px-6 border-t border-border/50">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="glass">
              <CardContent className="p-8 text-center space-y-2">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-2">
                  <TrendingUp className="h-6 w-6 text-primary" />
                </div>
                <div className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                  10x
                </div>
                <p className="text-sm text-muted-foreground">Mais leads abordados por mês</p>
              </CardContent>
            </Card>
            <Card className="glass">
              <CardContent className="p-8 text-center space-y-2">
                <div className="h-12 w-12 rounded-xl bg-accent/10 flex items-center justify-center mx-auto mb-2">
                  <Clock className="h-6 w-6 text-accent" />
                </div>
                <div className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                  24/7
                </div>
                <p className="text-sm text-muted-foreground">SDR de IA conversando com leads</p>
              </CardContent>
            </Card>
            <Card className="glass">
              <CardContent className="p-8 text-center space-y-2">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-2">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <div className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                  +80%
                </div>
                <p className="text-sm text-muted-foreground">Taxa de resposta vs cold mail</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-16 md:py-24 px-6 border-t border-border/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <Badge variant="outline" className="mb-4 border-primary/30 bg-primary/5 text-primary">
              Planos
            </Badge>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
              Comece grátis. Cresça quando quiser.
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Modelo de créditos: você só gasta no que usar. Sem fidelidade, sem surpresa.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {/* Trial */}
            <Card className="border-border/60 flex flex-col">
              <CardContent className="p-8 flex-1 flex flex-col">
                <div className="mb-6">
                  <h3 className="font-semibold text-xl mb-2">Trial</h3>
                  <p className="text-sm text-muted-foreground mb-4">Para experimentar a plataforma</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold">Grátis</span>
                  </div>
                </div>
                <ul className="space-y-3 text-sm mb-8 flex-1">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span>Créditos iniciais para testar</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span>Descoberta de leads</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span>Geração de copy com IA</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span>Conexão WhatsApp</span>
                  </li>
                </ul>
                <Button asChild variant="outline" className="w-full">
                  <Link to="/login">Começar grátis</Link>
                </Button>
              </CardContent>
            </Card>

            {/* Básico */}
            <Card className="border-primary shadow-elegant flex flex-col relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge className="gradient-primary text-primary-foreground border-0">
                  <Star className="h-3 w-3 mr-1" />
                  Mais popular
                </Badge>
              </div>
              <CardContent className="p-8 flex-1 flex flex-col">
                <div className="mb-6">
                  <h3 className="font-semibold text-xl mb-2">Básico</h3>
                  <p className="text-sm text-muted-foreground mb-4">Para profissionais e pequenas agências</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold">R$ 197</span>
                    <span className="text-muted-foreground">/mês</span>
                  </div>
                </div>
                <ul className="space-y-3 text-sm mb-8 flex-1">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span>Tudo do Trial</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span>Pacote mensal de créditos</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span>Agente SDR de IA</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span>Integração Google Calendar</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span>Kanban de prospecção</span>
                  </li>
                </ul>
                <Button asChild variant="premium" className="w-full">
                  <Link to="/billing/plans">Assinar Básico</Link>
                </Button>
              </CardContent>
            </Card>

            {/* Avançado */}
            <Card className="border-border/60 flex flex-col">
              <CardContent className="p-8 flex-1 flex flex-col">
                <div className="mb-6">
                  <h3 className="font-semibold text-xl mb-2">Avançado</h3>
                  <p className="text-sm text-muted-foreground mb-4">Para agências em escala</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold">R$ 497</span>
                    <span className="text-muted-foreground">/mês</span>
                  </div>
                </div>
                <ul className="space-y-3 text-sm mb-8 flex-1">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span>Tudo do Básico</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span>Volume premium de créditos</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span>Suporte prioritário</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span>Pacotes adicionais com desconto</span>
                  </li>
                </ul>
                <Button asChild variant="outline" className="w-full">
                  <Link to="/billing/plans">Assinar Avançado</Link>
                </Button>
              </CardContent>
            </Card>
          </div>

          <p className="text-center text-sm text-muted-foreground mt-8">
            Valores e pacotes podem variar. Consulte os{" "}
            <Link to="/billing/plans" className="text-primary hover:underline">
              planos atualizados
            </Link>{" "}
            após o cadastro.
          </p>
        </div>
      </section>

      {/* Trust */}
      <section className="py-16 px-6 border-t border-border/50">
        <div className="max-w-4xl mx-auto">
          <Card className="border-primary/20 bg-card/80">
            <CardContent className="p-8 md:p-10 flex flex-col md:flex-row items-start md:items-center gap-6">
              <div className="h-14 w-14 rounded-xl gradient-primary flex items-center justify-center shadow-soft shrink-0">
                <ShieldCheck className="h-7 w-7 text-primary-foreground" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold mb-2">Seus dados protegidos</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Conformidade com a LGPD. Conexão segura com Google Calendar (apenas leitura de disponibilidade).
                  Você controla quando conectar e quando desconectar.
                </p>
              </div>
              <Button asChild variant="outline">
                <Link to="/privacy">Política de Privacidade</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-16 md:py-24 px-6 border-t border-border/50">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <Badge variant="outline" className="mb-4 border-primary/30 bg-primary/5 text-primary">
              FAQ
            </Badge>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">Perguntas frequentes</h2>
          </div>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="q1">
              <AccordionTrigger>Preciso instalar alguma coisa?</AccordionTrigger>
              <AccordionContent>
                Não. O Prospectus roda 100% na nuvem. Você acessa pelo navegador, conecta o WhatsApp via QR Code
                e está pronto para prospectar.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="q2">
              <AccordionTrigger>Como funciona o sistema de créditos?</AccordionTrigger>
              <AccordionContent>
                Cada ação consome créditos: descobrir um lead, gerar uma copy com IA, enviar uma mensagem. Você
                escolhe um plano com pacote mensal e pode comprar créditos avulsos quando precisar.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="q3">
              <AccordionTrigger>O agente de IA conversa de verdade com os leads?</AccordionTrigger>
              <AccordionContent>
                Sim. O SDR de IA é treinado com o contexto da sua agência (ICP, persona, qualificação) e responde
                no WhatsApp como um atendente humano. Você pode ativar ou desativar o agente por lead.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="q4">
              <AccordionTrigger>Vocês vendem listas prontas de leads?</AccordionTrigger>
              <AccordionContent>
                Não vendemos lista. Você define o nicho e a cidade, e o sistema busca empresas reais e atualizadas
                com dados públicos enriquecidos (WhatsApp, Instagram, site, CNPJ).
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="q5">
              <AccordionTrigger>Posso cancelar quando quiser?</AccordionTrigger>
              <AccordionContent>
                Sim. Sem fidelidade, sem multa. Você cancela a assinatura a qualquer momento direto no painel.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="q6">
              <AccordionTrigger>Funciona para qualquer nicho?</AccordionTrigger>
              <AccordionContent>
                O Prospectus foi desenhado para agências de marketing e times comerciais B2B que vendem para
                pequenas e médias empresas. Funciona muito bem para nichos locais (clínicas, restaurantes, lojas,
                academias, etc.) e segmentos verticalizados.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 md:py-28 px-6 border-t border-border/50 relative overflow-hidden">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[400px] w-[700px] rounded-full opacity-20 blur-3xl gradient-primary"
          aria-hidden
        />
        <div className="relative max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-6">
            Pronto para encher sua agenda?
          </h2>
          <p className="text-lg text-muted-foreground mb-10 max-w-2xl mx-auto">
            Crie sua conta grátis, conecte o WhatsApp e veja a IA prospectar pra você. Sem cartão, sem
            compromisso.
          </p>
          <Button asChild variant="premium" size="lg">
            <Link to="/login">
              Começar grátis agora
              <ArrowRight className="h-5 w-5" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg gradient-primary flex items-center justify-center">
              <Zap className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span>© {new Date().getFullYear()} Prospectus. Todos os direitos reservados.</span>
          </div>
          <div className="flex items-center gap-6">
            <Link to="/about" className="hover:text-primary transition-colors">
              Sobre
            </Link>
            <Link to="/privacy" className="hover:text-primary transition-colors">
              Privacidade
            </Link>
            <Link to="/login" className="hover:text-primary transition-colors">
              Entrar
            </Link>
          </div>
        </div>
      </footer>
    </div>
  </>
);

export default Landing;
