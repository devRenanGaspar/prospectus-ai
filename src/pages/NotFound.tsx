import { useLocation, Link } from "react-router-dom";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  return (
    <>
      <SEO title="Página não encontrada" description="A página que você procura não existe." />
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="text-center animate-fade-in">
          <p className="text-7xl font-bold gradient-primary bg-clip-text text-transparent mb-4">404</p>
          <h1 className="text-2xl font-bold mb-2">Página não encontrada</h1>
          <p className="text-muted-foreground mb-8 max-w-sm mx-auto">
            A página <code className="text-xs bg-secondary px-1.5 py-0.5 rounded">{location.pathname}</code> não existe ou foi movida.
          </p>
          <Button variant="premium" asChild>
            <Link to="/dashboard">
              <Home className="h-4 w-4 mr-2" />
              Voltar ao Dashboard
            </Link>
          </Button>
        </div>
      </div>
    </>
  );
};

export default NotFound;
