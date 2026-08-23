import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Zap, ArrowRight, Mail, Lock, UserIcon, Shield, Eye, EyeOff } from "lucide-react";
import { Link } from "react-router-dom";
import SEO from "@/components/SEO";
import { lovable } from "@/integrations/lovable/index";

const LoginForm = () => {
  const { user, signIn, signUp, resetPassword, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  if (user && !authLoading) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (mode === "forgot") {
        await resetPassword(email);
        toast.success("Email de recuperação enviado! Verifique sua caixa de entrada.");
        setMode("login");
      } else if (mode === "signup") {
        await signUp(email, password, fullName);
        toast.success("Conta criada com sucesso!");
        navigate("/check-email", { state: { email } });
      } else {
        await signIn(email, password);
        toast.success("Bem-vindo de volta!");
      }
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : "Erro ao entrar.";
      const msg = errMessage === "Invalid login credentials"
        ? "Email ou senha incorretos."
        : errMessage;
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <SEO
        title={mode === "signup" ? "Criar conta" : mode === "forgot" ? "Recuperar senha" : "Login"}
        description="Acesse a plataforma Prospectus para gerenciar suas prospecções de tráfego."
      />

      <div className="flex min-h-screen bg-background items-center justify-center">
        {/* Form panel */}
        <div className="flex w-full max-w-lg items-center justify-center p-6 sm:p-8">
          <div className="w-full max-w-md">
            {/* Logo mobile */}
            <div className="flex items-center gap-2.5 mb-10 lg:mb-12">
              <div className="h-10 w-10 rounded-xl gradient-primary flex items-center justify-center shadow-soft">
                <Zap className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="font-bold text-xl tracking-tight">Prospectus</span>
            </div>

            <Card className="border-border bg-card/80 backdrop-blur-sm shadow-elegant">
              <CardHeader className="space-y-1.5 pb-5">
                <CardTitle className="text-2xl font-bold">
                  {mode === "forgot" ? "Recuperar senha" : mode === "signup" ? "Criar conta" : "Entrar na plataforma"}
                </CardTitle>
                <CardDescription>
                  {mode === "forgot"
                    ? "Insira seu email para receber o link de recuperação"
                    : mode === "signup"
                    ? "Crie sua conta e comece a prospectar em minutos"
                    : "Acesse seu pipeline de prospecção"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-5">
                  {mode === "signup" && (
                    <div className="space-y-2">
                      <Label htmlFor="fullName">Nome completo</Label>
                      <div className="relative">
                        <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="fullName"
                          placeholder="João Silva"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          required
                          className="pl-9"
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="seu@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="pl-9"
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  {mode !== "forgot" && (
                    <div className="space-y-2">
                      <Label htmlFor="password">Senha</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          placeholder="••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          minLength={6}
                          className="pl-9 pr-9"
                          autoComplete={mode === "signup" ? "new-password" : "current-password"}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          tabIndex={-1}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  )}

                  {error && (
                    <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive" role="alert">
                      {error}
                    </div>
                  )}

                  <Button
                    type="submit"
                    variant="premium"
                    className="w-full h-11 text-sm font-semibold"
                    disabled={loading}
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        Carregando...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        {mode === "forgot" ? "Enviar email" : mode === "signup" ? "Criar conta" : "Entrar"}
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    )}
                  </Button>
                </form>

                {mode !== "forgot" && (
                  <>
                    <div className="relative my-5">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t border-border" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-card px-2 text-muted-foreground">ou continue com</span>
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      className="w-full h-11"
                      onClick={async () => {
                        const { error } = await lovable.auth.signInWithOAuth("google", {
                          redirect_uri: window.location.origin,
                        });
                        if (error) toast.error(error.message || "Erro ao entrar com Google");
                      }}
                    >
                      <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                      </svg>
                      Google
                    </Button>
                  </>
                )}

                <div className="mt-6 space-y-2 text-center text-sm">
                  {mode === "login" && (
                    <button
                      onClick={() => { setMode("forgot"); setError(""); }}
                      className="block w-full text-muted-foreground hover:text-primary transition-colors"
                    >
                      Esqueceu sua senha?
                    </button>
                  )}
                  <button
                    onClick={() => { setMode(mode === "signup" ? "login" : "signup"); setError(""); }}
                    className="block w-full text-muted-foreground hover:text-primary transition-colors"
                  >
                    {mode === "signup" ? "Já tem conta? Entre aqui" : "Não tem conta? Crie uma agora"}
                  </button>
                  {mode === "forgot" && (
                    <button
                      onClick={() => { setMode("login"); setError(""); }}
                      className="block w-full text-muted-foreground hover:text-primary transition-colors"
                    >
                      Voltar ao login
                    </button>
                  )}
                </div>

                <div className="mt-4 pt-4 border-t border-border/50 text-center">
                  <Link
                    to="/privacy"
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Shield className="h-3 w-3" />
                    Política de Privacidade
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
};

export default LoginForm;
