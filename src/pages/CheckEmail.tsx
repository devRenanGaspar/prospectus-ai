import { useLocation, Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Zap, Mail, ArrowLeft, AlertTriangle } from "lucide-react";
import SEO from "@/components/SEO";

const CheckEmail = () => {
  const location = useLocation();
  const email = (location.state as { email?: string })?.email || "";

  return (
    <>
      <SEO title="Verifique seu email" description="Confirme seu email para ativar sua conta no Prospectus." />
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-2.5 mb-8 justify-center">
            <div className="h-10 w-10 rounded-xl gradient-primary flex items-center justify-center shadow-soft">
              <Zap className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-xl tracking-tight">Prospectus</span>
          </div>

          <Card className="border-border/50 shadow-elegant text-center">
            <CardContent className="pt-8 pb-8 space-y-5">
              <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Mail className="h-8 w-8 text-primary" />
              </div>

              <div className="space-y-2">
                <h1 className="text-xl font-bold">Verifique seu email</h1>
                <p className="text-muted-foreground text-sm">
                  Enviamos um link de confirmação para:
                </p>
                {email && (
                  <p className="font-semibold text-foreground">{email}</p>
                )}
              </div>

              <div className="rounded-lg bg-muted/50 border border-border/50 px-4 py-3 flex items-start gap-3 text-left">
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-sm text-muted-foreground">
                  Não encontrou? Verifique sua pasta de <strong className="text-foreground">SPAM</strong> ou lixo eletrônico.
                </p>
              </div>

              <Button variant="outline" className="w-full" asChild>
                <Link to="/login">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Voltar ao login
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
};

export default CheckEmail;
