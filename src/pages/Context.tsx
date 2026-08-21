import { useEffect, useState, useRef, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import SEO from "@/components/SEO";
import PageHeader from "@/components/PageHeader";
import LoadingState from "@/components/LoadingState";
import ErrorState from "@/components/ErrorState";
import { useAgencyContext, useUpdateAgencyContext } from "@/hooks/useAgencyContext";
import type { AgencyContextData, SdrAvailability } from "@/hooks/useAgencyContext";
import { useDebounce } from "@/hooks/useDebounce";
import { useNicheOptions } from "@/hooks/useNicheOptions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DEFAULT_BUSINESS_TYPE, BUSINESS_TYPE_LABELS } from "@/lib/business-types";
import { Plus, Trash2, Save, Building2, Target, Check, Loader2, AlertCircle, MessageCircleQuestion, Phone, Clock, Coffee } from "lucide-react";
import LocationPicker, { buildLocalizacaoString } from "@/components/LocationPicker";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";

// ── Zod Schema ──
const faqItemSchema = z.object({
  pergunta: z.string().trim().max(200, "Máx. 200 caracteres"),
  resposta: z.string().trim().max(1000, "Máx. 1000 caracteres"),
});

const sdrDaySlotSchema = z.object({
  enabled: z.boolean().default(false),
  start: z.string().max(5).default(""),
  end: z.string().max(5).default(""),
});

const sdrAvailabilitySchema = z.object({
  days: z.record(sdrDaySlotSchema).default({}),
  lunch: sdrDaySlotSchema.default({ enabled: true, start: "12:00", end: "13:00" }),
});

const agencySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Nome deve ter pelo menos 2 caracteres")
    .max(100, "Nome deve ter no máximo 100 caracteres"),
  ownerName: z
    .string()
    .trim()
    .max(100, "Máx. 100 caracteres")
    .optional()
    .or(z.literal("")),
  sdrName: z
    .string()
    .trim()
    .max(100, "Máx. 100 caracteres")
    .default("MarIA"),
  persona: z
    .string()
    .trim()
    .max(2000, "Persona deve ter no máximo 2000 caracteres")
    .optional()
    .or(z.literal("")),
  tomDeVoz: z
    .string()
    .trim()
    .max(500, "Tom de voz deve ter no máximo 500 caracteres")
    .optional()
    .or(z.literal("")),
  diferenciais: z
    .string()
    .trim()
    .max(1000, "Diferenciais deve ter no máximo 1000 caracteres")
    .optional()
    .or(z.literal("")),
  icp: z.object({
    nichoPrincipal: z.string().trim().min(1, "Nicho principal é obrigatório").max(100),
    nichoSecundario: z.string().trim().max(100).optional().or(z.literal("")),
    nichoAlternativo: z.string().trim().max(100).optional().or(z.literal("")),
    localizacao: z.string().trim().max(200).optional().or(z.literal("")),
    estado: z.string().trim().max(10).optional().or(z.literal("")),
    cidade: z.string().trim().max(100).optional().or(z.literal("")),
    idioma: z.string().trim().max(10).optional().or(z.literal("")),
  }),
  qualificacao: z.object({
    superQualificado: z.array(z.string().trim().max(300)).max(5),
    emAnalise: z.array(z.string().trim().max(300)).max(5),
    desqualificado: z.array(z.string().trim().max(300)).max(5),
  }),
  faq: z.array(faqItemSchema).max(20),
  sdrPhone: z.string().trim().max(20).optional().or(z.literal("")),
  sdrAvailability: sdrAvailabilitySchema,
});

type AgencyFormData = z.infer<typeof agencySchema>;

const DAY_KEYS = ["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"] as const;
const DAY_LABELS: Record<string, string> = {
  segunda: "Segunda-feira",
  terca: "Terça-feira",
  quarta: "Quarta-feira",
  quinta: "Quinta-feira",
  sexta: "Sexta-feira",
  sabado: "Sábado",
  domingo: "Domingo",
};

const defaultSdrAvailability: SdrAvailability = {
  days: {
    segunda: { enabled: true, start: "09:00", end: "18:00" },
    terca: { enabled: true, start: "09:00", end: "18:00" },
    quarta: { enabled: true, start: "09:00", end: "18:00" },
    quinta: { enabled: true, start: "09:00", end: "18:00" },
    sexta: { enabled: true, start: "09:00", end: "18:00" },
    sabado: { enabled: false, start: "09:00", end: "13:00" },
    domingo: { enabled: false, start: "", end: "" },
  },
  lunch: { enabled: true, start: "12:00", end: "13:00" },
};

// ── Save status types ──
type SaveStatus = "idle" | "saving" | "saved" | "error";

// ── Save status indicator ──
const SaveStatusIndicator = ({ status }: { status: SaveStatus }) => {
  if (status === "idle") return null;

  return (
    <div className="flex items-center gap-1.5 text-sm animate-fade-in">
      {status === "saving" && (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          <span className="text-muted-foreground">Salvando...</span>
        </>
      )}
      {status === "saved" && (
        <>
          <Check className="h-3.5 w-3.5 text-primary" />
          <span className="text-primary">Salvo</span>
        </>
      )}
      {status === "error" && (
        <>
          <AlertCircle className="h-3.5 w-3.5 text-destructive" />
          <span className="text-destructive">Erro ao salvar</span>
        </>
      )}
    </div>
  );
};

// ── FAQ Section sub-component ──
const FaqSection = ({ form }: { form: ReturnType<typeof useForm<AgencyFormData>> }) => {
  const items = form.watch("faq") || [];

  const addItem = () => {
    if (items.length >= 20) return;
    form.setValue("faq", [...items, { pergunta: "", resposta: "" }], { shouldDirty: true });
  };

  const removeItem = (index: number) => {
    form.setValue(
      "faq",
      items.filter((_, i) => i !== index),
      { shouldDirty: true }
    );
  };

  const updateItem = (index: number, field: "pergunta" | "resposta", value: string) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    form.setValue("faq", updated, { shouldDirty: true });
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageCircleQuestion className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-lg">FAQ do SDR</CardTitle>
              <CardDescription>Perguntas e respostas que o agente usará para tirar dúvidas dos leads.</CardDescription>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addItem}
            disabled={items.length >= 20}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Adicionar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <MessageCircleQuestion className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm font-medium">Nenhuma pergunta cadastrada</p>
            <p className="text-xs mt-1">Adicione perguntas frequentes para que o agente SDR saiba responder seus leads.</p>
          </div>
        )}

        {items.map((item: { pergunta: string; resposta: string }, index: number) => (
          <div key={index} className="rounded-lg border border-border/50 p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 space-y-3">
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Pergunta {index + 1}
                  </Label>
                  <Input
                    value={item.pergunta}
                    onChange={(e) => updateItem(index, "pergunta", e.target.value)}
                    placeholder="Ex: Qual o valor mínimo de investimento?"
                    maxLength={200}
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Resposta
                  </Label>
                  <Textarea
                    value={item.resposta}
                    onChange={(e) => updateItem(index, "resposta", e.target.value)}
                    placeholder="Ex: O investimento mínimo em tráfego é de R$ 2.000/mês..."
                    maxLength={1000}
                    rows={3}
                  />
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive mt-5"
                onClick={() => removeItem(index)}
                aria-label={`Remover pergunta ${index + 1}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}

        {items.length > 0 && items.length < 20 && (
          <p className="text-xs text-muted-foreground text-center">
            {items.length}/20 perguntas cadastradas
          </p>
        )}
      </CardContent>
    </Card>
  );
};


const Context = () => {
  const { data: agency, isLoading, isError, refetch } = useAgencyContext();
  const updateMutation = useUpdateAgencyContext();
  const { data: nicheOptions = [] } = useNicheOptions();
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const isInitialLoad = useRef(true);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const form = useForm<AgencyFormData>({
    resolver: zodResolver(agencySchema),
    defaultValues: {
      name: "",
      ownerName: "",
      sdrName: "MarIA",
      persona: "",
      tomDeVoz: "",
      diferenciais: "",
      icp: {
        nichoPrincipal: "",
        nichoSecundario: "",
        nichoAlternativo: "",
        localizacao: "",
        estado: "",
        cidade: "",
        idioma: "",
      },
      qualificacao: {
        superQualificado: [
          "Já investe em tráfego pago",
          "Está buscando escala, não salvação do negócio",
          "Pode investir pelo menos 2 mil reais em tráfego",
        ],
        emAnalise: [
          "Entende que o tráfego vai gerar leads, mas não adianta se ele não conseguir atender bem",
          "Tem site e instagram",
        ],
        desqualificado: [
          "Quer investir menos de mil reais",
          "Precisa de resultado em 1 mês",
        ],
      },
      faq: [],
      sdrPhone: "",
      sdrAvailability: defaultSdrAvailability,
    },
  });


  const hasInitialized = useRef(false);
  const [formReady, setFormReady] = useState(false);

  // Populate form ONCE when agency data first arrives
  useEffect(() => {
    if (agency && !hasInitialized.current) {
      const personaRaw = agency.context_persona || "";
      let persona = personaRaw;
      let tomDeVoz = "";
      let diferenciais = "";

      try {
        const parsed = JSON.parse(personaRaw);
        if (parsed && typeof parsed === "object") {
          persona = parsed.persona || "";
          tomDeVoz = parsed.tomDeVoz || "";
          diferenciais = parsed.diferenciais || "";
        }
      } catch {
        // plain text, keep as persona
      }

      form.reset({
        name: agency.name,
        ownerName: agency.owner_name ?? "",
        sdrName: agency.sdr_name ?? "MarIA",
        persona,
        tomDeVoz,
        diferenciais,
        icp: {
          nichoPrincipal: agency.context_icp?.nichoPrincipal ?? "",
          nichoSecundario: agency.context_icp?.nichoSecundario ?? "",
          nichoAlternativo: agency.context_icp?.nichoAlternativo ?? "",
          localizacao: agency.context_icp?.localizacao ?? "",
          estado: agency.context_icp?.estado ?? "",
          cidade: agency.context_icp?.cidade ?? "",
          idioma: agency.context_icp?.idioma ?? "",
        },
        qualificacao: {
          superQualificado: agency.context_qualification?.superQualificado?.length
            ? agency.context_qualification.superQualificado
            : [
                "Já investe em tráfego pago",
                "Está buscando escala, não salvação do negócio",
                "Pode investir pelo menos 2 mil reais em tráfego",
              ],
          emAnalise: agency.context_qualification?.emAnalise?.length
            ? agency.context_qualification.emAnalise
            : [
                "Entende que o tráfego vai gerar leads, mas não adianta se ele não conseguir atender bem",
                "Tem site e instagram",
              ],
          desqualificado: agency.context_qualification?.desqualificado?.length
            ? agency.context_qualification.desqualificado
            : [
                "Quer investir menos de mil reais",
                "Precisa de resultado em 1 mês",
              ],
        },
        faq: agency.context_faq?.length ? agency.context_faq : [],
        sdrPhone: agency.sdr_phone ?? "",
        sdrAvailability: agency.sdr_availability ?? defaultSdrAvailability,
      });

      hasInitialized.current = true;
      setFormReady(true);

      // Mark initial load complete after a tick so debounce skips first emission
      setTimeout(() => {
        isInitialLoad.current = false;
      }, 100);
    }
  }, [agency, form]);

  // Build the mutation payload from form data
  const buildPayload = useCallback((data: AgencyFormData): AgencyContextData => {
    const contextPersona = JSON.stringify({
      persona: data.persona,
      tomDeVoz: data.tomDeVoz,
      diferenciais: data.diferenciais,
    });

    return {
      name: data.name,
      full_name: agency?.full_name ?? null,
      owner_name: data.ownerName || null,
      sdr_name: data.sdrName || "MarIA",
      context_persona: contextPersona,
      context_icp: {
        nichoPrincipal: data.icp.nichoPrincipal ?? "",
        nichoSecundario: data.icp.nichoSecundario ?? "",
        nichoAlternativo: data.icp.nichoAlternativo ?? "",
        localizacao: buildLocalizacaoString(data.icp.estado, data.icp.cidade) || (data.icp.localizacao ?? ""),
        estado: data.icp.estado ?? "",
        cidade: data.icp.cidade ?? "",
        idioma: data.icp.idioma ?? "",
      },
      context_qualification: {
        superQualificado: (data.qualificacao.superQualificado ?? []).filter((s) => s.trim().length > 0),
        emAnalise: (data.qualificacao.emAnalise ?? []).filter((s) => s.trim().length > 0),
        desqualificado: (data.qualificacao.desqualificado ?? []).filter((s) => s.trim().length > 0),
      },
      context_faq: (data.faq ?? []).filter((f) => f.pergunta.trim().length > 0) as { pergunta: string; resposta: string }[],
      sdr_phone: data.sdrPhone || null,
      sdr_availability: data.sdrAvailability as unknown as SdrAvailability,
      business_type: agency?.business_type ?? DEFAULT_BUSINESS_TYPE,
    };
  }, [agency?.business_type, agency?.full_name]);

  // Watch all form values for auto-save
  const watchedValues = form.watch();
  const debouncedValues = useDebounce(JSON.stringify(watchedValues), 1500);

  useEffect(() => {
    if (isInitialLoad.current) return;

    const doAutoSave = async () => {
      const isValid = await form.trigger();
      if (!isValid) return;

      const data = form.getValues();
      const payload = buildPayload(data);

      setSaveStatus("saving");
      clearTimeout(savedTimerRef.current);

      updateMutation.mutate(
        { data: payload, silent: true },
        {
          onSuccess: () => {
            setSaveStatus("saved");
            savedTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2500);
          },
          onError: () => {
            setSaveStatus("error");
            savedTimerRef.current = setTimeout(() => setSaveStatus("idle"), 4000);
          },
        }
      );
    };

    doAutoSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedValues]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => clearTimeout(savedTimerRef.current);
  }, []);

  // Manual save handler
  const onSubmit = (data: AgencyFormData) => {
    const payload = buildPayload(data);
    setSaveStatus("saving");
    clearTimeout(savedTimerRef.current);

    updateMutation.mutate(
      { data: payload, silent: false },
      {
        onSuccess: () => {
          setSaveStatus("saved");
          savedTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2500);
        },
        onError: () => {
          setSaveStatus("error");
          savedTimerRef.current = setTimeout(() => setSaveStatus("idle"), 4000);
        },
      }
    );
  };

  if (isError) {
    // Block the form entirely on error, rather than letting it mount with
    // hardcoded defaults -- this page autosaves, and autosaving empty
    // defaults over a real saved configuration is worse than a blank screen.
    return (
      <>
        <SEO title="Contexto da Agência" description="Defina persona, ICP e critérios de qualificação." />
        <PageHeader
          title="Contexto da Agência"
          breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Contexto" }]}
        />
        <ErrorState onRetry={() => refetch()} />
      </>
    );
  }

  if (isLoading || !formReady) {
    return (
      <>
        <SEO title="Contexto da Agência" description="Defina persona, ICP e critérios de qualificação." />
        <PageHeader
          title="Contexto da Agência"
          breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Contexto" }]}
        />
        <LoadingState variant="page" />
      </>
    );
  }

  return (
    <>
      <SEO title="Contexto da Agência" description="Defina persona, ICP e critérios de qualificação para sua agência." />
      <PageHeader
        title="Contexto da Agência"
        description="Configure sua agência para personalizar a prospecção e geração de copy."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Contexto" }]}
        actions={
          <div className="flex items-center gap-3">
            <SaveStatusIndicator status={saveStatus} />
            <Button
              variant="premium"
              onClick={form.handleSubmit(onSubmit)}
              disabled={updateMutation.isPending}
              size="sm"
            >
              <Save className="h-4 w-4 mr-1" />
              Salvar
            </Button>
          </div>
        }
      />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-4xl animate-fade-in">
          {/* ── Dados da Agência ── */}
          <Card className="border-border/50">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Dados da Agência</CardTitle>
              </div>
              <CardDescription>Informações sobre sua agência e como ela se comunica.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome da agência *</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Agência Digital XYZ" {...field} maxLength={100} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormItem>
                <FormLabel>Tipo de negócio</FormLabel>
                <FormDescription>
                  Em breve você poderá escolher outros tipos de negócio.
                </FormDescription>
                <Select value={agency?.business_type ?? DEFAULT_BUSINESS_TYPE} disabled>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Object.entries(BUSINESS_TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label as string}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>

              <FormField
                control={form.control}
                name="ownerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome do dono da agência</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: João Silva" {...field} maxLength={100} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sdrName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome do SDR (agente de IA)</FormLabel>
                    <FormDescription>
                      Nome do agente de IA que irá conversar com os leads.
                    </FormDescription>
                    <FormControl>
                      <Input placeholder="MarIA" {...field} maxLength={100} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="persona"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Conte quem é sua agência</FormLabel>
                    <FormDescription>
                      Descreva quem é sua agência, o que faz e como se posiciona no mercado.
                    </FormDescription>
                    <FormControl>
                      <Textarea
                        placeholder="Somos uma agência especializada em tráfego pago para negócios locais..."
                        rows={4}
                        {...field}
                        maxLength={2000}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="tomDeVoz"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tom de voz</FormLabel>
                    <FormDescription>
                      Ex: profissional e direto, consultivo e amigável, técnico e detalhista.
                    </FormDescription>
                    <FormControl>
                      <Input placeholder="Profissional, consultivo e orientado a resultados" {...field} maxLength={500} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {/* Diferenciais — oculto temporariamente
              <FormField
                control={form.control}
                name="diferenciais"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Diferenciais</FormLabel>
                    <FormDescription>
                      O que diferencia sua agência da concorrência?
                    </FormDescription>
                    <FormControl>
                      <Textarea
                        placeholder="ROI garantido, relatórios semanais, gestão dedicada..."
                        rows={3}
                        {...field}
                        maxLength={1000}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              */}
            </CardContent>
          </Card>

          {/* ── ICP ── */}
          <Card className="border-border/50">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Perfil Ideal de Cliente (ICP)</CardTitle>
              </div>
              <CardDescription>Defina as características do seu cliente ideal para segmentação.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <FormField
                control={form.control}
                name="icp.nichoPrincipal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nicho Principal *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || undefined}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o nicho principal" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {field.value && !nicheOptions.some(opt => opt.name === field.value) && (
                          <SelectItem value={field.value}>{field.value} (salvo)</SelectItem>
                        )}
                        {nicheOptions.map((opt) => (
                          <SelectItem key={opt.id} value={opt.name}>{opt.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="icp.nichoSecundario"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nicho Secundário</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || undefined}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o nicho secundário" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {field.value && !nicheOptions.some(opt => opt.name === field.value) && (
                            <SelectItem value={field.value}>{field.value} (salvo)</SelectItem>
                          )}
                          {nicheOptions.map((opt) => (
                            <SelectItem key={opt.id} value={opt.name}>{opt.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="icp.nichoAlternativo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nicho Alternativo</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || undefined}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o nicho alternativo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {field.value && !nicheOptions.some(opt => opt.name === field.value) && (
                            <SelectItem value={field.value}>{field.value} (salvo)</SelectItem>
                          )}
                          {nicheOptions.map((opt) => (
                            <SelectItem key={opt.id} value={opt.name}>{opt.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-2">
                <FormLabel>Localização</FormLabel>
                <FormDescription>Selecione estado e cidade. Opcional.</FormDescription>
                <LocationPicker
                  estado={form.watch("icp.estado") || ""}
                  cidade={form.watch("icp.cidade") || ""}
                  onChange={({ estado, cidade }) => {
                    form.setValue("icp.estado", estado, { shouldDirty: true });
                    form.setValue("icp.cidade", cidade, { shouldDirty: true });
                  }}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="icp.idioma"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Idioma</FormLabel>
                      <FormDescription>Opcional, deixe em branco para Brasil</FormDescription>
                      <Select onValueChange={field.onChange} value={field.value || undefined}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o idioma" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="pt-BR">Português (pt-BR)</SelectItem>
                          <SelectItem value="en-US">English (en-US)</SelectItem>
                          <SelectItem value="es-CO">Español (es-CO)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

            </CardContent>
          </Card>

          {/* ── Qualificação — oculto temporariamente ──
          <Card className="border-border/50">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Critérios de Qualificação</CardTitle>
              </div>
              <CardDescription>Defina critérios para classificar leads automaticamente em 3 grupos.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <QualificationGroup
                form={form}
                groupKey="superQualificado"
                title="Super Qualificado"
                description="O lead que atender esses critérios é qualificado na hora."
                icon={<CheckCircle className="h-4 w-4 text-emerald-500" />}
                borderColor="border-emerald-500/30"
                bgColor="bg-emerald-500/5"
              />
              <QualificationGroup
                form={form}
                groupKey="emAnalise"
                title="Em Análise"
                description="Não atende todos os critérios do grupo anterior, mas vale analisar."
                icon={<AlertCircle className="h-4 w-4 text-amber-500" />}
                borderColor="border-amber-500/30"
                bgColor="bg-amber-500/5"
              />
              <QualificationGroup
                form={form}
                groupKey="desqualificado"
                title="Desqualificado"
                description="Informações que desqualificam o lead imediatamente."
                icon={<XCircle className="h-4 w-4 text-red-500" />}
                borderColor="border-red-500/30"
                bgColor="bg-red-500/5"
              />
            </CardContent>
          </Card>
          */}

          {/* ── FAQ do SDR ── */}
          <FaqSection form={form} />

          {/* ── Configurações do SDR ── */}
          <Card className="border-border/50">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <Phone className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-lg">Configurações do SDR</CardTitle>
                  <CardDescription>Telefone para escalação humana e horários disponíveis para agendamento de reuniões.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Telefone do Responsável */}
              <FormField
                control={form.control}
                name="sdrPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone do Responsável</FormLabel>
                    <FormDescription>
                      Número para o agente de IA escalar a conversa para um humano quando necessário.
                    </FormDescription>
                    <FormControl>
                      <Input placeholder="Ex: 5511999999999" {...field} maxLength={20} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Separator />

              {/* Disponibilidade para Reuniões */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">Disponibilidade para Reuniões</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Defina os dias e horários em que o agente pode agendar reuniões com leads qualificados.
                </p>

                <div className="space-y-2">
                  {DAY_KEYS.map((dayKey) => {
                    const dayPath = `sdrAvailability.days.${dayKey}` as const;
                    const dayData = form.watch(dayPath) ?? { enabled: false, start: "", end: "" };
                    return (
                      <div key={dayKey} className="flex items-center gap-3 rounded-lg border border-border/50 p-3">
                        <Switch
                          checked={dayData.enabled}
                          onCheckedChange={(checked) => {
                            form.setValue(`sdrAvailability.days.${dayKey}.enabled`, checked, { shouldDirty: true });
                          }}
                        />
                        <span className={`text-sm w-32 ${dayData.enabled ? "font-medium" : "text-muted-foreground"}`}>
                          {DAY_LABELS[dayKey]}
                        </span>
                        <Input
                          type="time"
                          value={dayData.start}
                          onChange={(e) => form.setValue(`sdrAvailability.days.${dayKey}.start`, e.target.value, { shouldDirty: true })}
                          disabled={!dayData.enabled}
                          className="w-28"
                        />
                        <span className="text-xs text-muted-foreground">até</span>
                        <Input
                          type="time"
                          value={dayData.end}
                          onChange={(e) => form.setValue(`sdrAvailability.days.${dayKey}.end`, e.target.value, { shouldDirty: true })}
                          disabled={!dayData.enabled}
                          className="w-28"
                        />
                      </div>
                    );
                  })}
                </div>

                <Separator />

                {/* Horário de Almoço */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Coffee className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-sm font-medium">Horário de Almoço</Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Período do dia em que o agente não deve agendar reuniões.
                  </p>
                  {(() => {
                    const lunch = form.watch("sdrAvailability.lunch") ?? { enabled: true, start: "12:00", end: "13:00" };
                    return (
                      <div className="flex items-center gap-3 rounded-lg border border-border/50 p-3">
                        <Switch
                          checked={lunch.enabled}
                          onCheckedChange={(checked) => {
                            form.setValue("sdrAvailability.lunch.enabled", checked, { shouldDirty: true });
                          }}
                        />
                        <span className={`text-sm w-32 ${lunch.enabled ? "font-medium" : "text-muted-foreground"}`}>
                          Pausa almoço
                        </span>
                        <Input
                          type="time"
                          value={lunch.start}
                          onChange={(e) => form.setValue("sdrAvailability.lunch.start", e.target.value, { shouldDirty: true })}
                          disabled={!lunch.enabled}
                          className="w-28"
                        />
                        <span className="text-xs text-muted-foreground">até</span>
                        <Input
                          type="time"
                          value={lunch.end}
                          onChange={(e) => form.setValue("sdrAvailability.lunch.end", e.target.value, { shouldDirty: true })}
                          disabled={!lunch.enabled}
                          className="w-28"
                        />
                      </div>
                    );
                  })()}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── Prompts de IA (oculto temporariamente) ── */}
        </form>
      </Form>
    </>
  );
};

export default Context;
