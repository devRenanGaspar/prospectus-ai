import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { recordFrontendError } from "@/lib/observability";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  failed: boolean;
}

class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _errorInfo: ErrorInfo) {
    // Raw errors and component stacks must never leave the browser.
    recordFrontendError("REACT_RENDER_ERROR");
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <section className="max-w-md space-y-4 text-center" role="alert">
          <h1 className="text-2xl font-semibold text-foreground">
            Não foi possível carregar esta tela
          </h1>
          <p className="text-muted-foreground">
            Atualize a página para tentar novamente. Se o problema continuar,
            entre em contato com o suporte.
          </p>
          <Button type="button" onClick={() => window.location.reload()}>
            Atualizar página
          </Button>
        </section>
      </main>
    );
  }
}

export default AppErrorBoundary;
