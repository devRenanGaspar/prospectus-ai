import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LifeBuoy, Mail, MessageCircle, Copy, Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  SUPPORT_EMAIL,
  SUPPORT_EMAIL_URL,
  SUPPORT_WHATSAPP_DISPLAY,
  SUPPORT_WHATSAPP_URL,
} from "@/lib/support";

const SupportCard = () => {
  const [copied, setCopied] = useState<"email" | "whatsapp" | null>(null);
  const hasWhatsApp = Boolean(SUPPORT_WHATSAPP_DISPLAY && SUPPORT_WHATSAPP_URL);
  const hasEmail = Boolean(SUPPORT_EMAIL && SUPPORT_EMAIL_URL);

  const copyToClipboard = async (value: string, key: "email" | "whatsapp") => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      toast.success("Copiado!");
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  return (
    <Card className="border-border/50 max-w-3xl">
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-primary/10 p-2">
            <LifeBuoy className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle>Suporte & Ajuda</CardTitle>
            <CardDescription>
              Precisa de ajuda? Fale com nosso time pelos canais abaixo.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasWhatsApp && (
          <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/30 p-4">
            <div className="shrink-0 rounded-lg bg-green-500/10 p-2.5">
              <MessageCircle className="h-5 w-5 text-green-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">WhatsApp</p>
              <p className="text-sm text-muted-foreground truncate">{SUPPORT_WHATSAPP_DISPLAY}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => copyToClipboard(SUPPORT_WHATSAPP_DISPLAY, "whatsapp")}
              aria-label="Copiar WhatsApp"
            >
              {copied === "whatsapp" ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
            <Button asChild size="sm" className="bg-green-500 hover:bg-green-600 text-white">
              <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                Abrir
              </a>
            </Button>
          </div>
        )}

        {hasEmail && (
          <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/30 p-4">
            <div className="shrink-0 rounded-lg bg-primary/10 p-2.5">
              <Mail className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">E-mail</p>
              <p className="text-sm text-muted-foreground truncate">{SUPPORT_EMAIL}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => copyToClipboard(SUPPORT_EMAIL, "email")}
              aria-label="Copiar e-mail"
            >
              {copied === "email" ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href={SUPPORT_EMAIL_URL}>Enviar</a>
            </Button>
          </div>
        )}

        {!hasWhatsApp && !hasEmail && (
          <p className="rounded-lg border border-border/50 bg-muted/30 p-4 text-sm text-muted-foreground">
            Os canais de suporte são configurados somente no ambiente oficial de implantação.
          </p>
        )}

        <p className="text-xs text-muted-foreground pt-1">
          Respondemos em horário comercial, de segunda a sexta.
        </p>
      </CardContent>
    </Card>
  );
};

export default SupportCard;
