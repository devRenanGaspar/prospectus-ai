import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

interface Breadcrumb {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: Breadcrumb[];
  actions?: React.ReactNode;
}

const PageHeader = ({ title, description, breadcrumbs, actions }: PageHeaderProps) => (
  <header className="mb-8 animate-fade-in">
    {breadcrumbs && breadcrumbs.length > 0 && (
      <nav aria-label="Breadcrumb" className="mb-3">
        <ol className="flex items-center gap-1 text-sm text-muted-foreground">
          {breadcrumbs.map((crumb, i) => (
            <li key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5" />}
              {crumb.href ? (
                <Link to={crumb.href} className="hover:text-foreground transition-colors">
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-foreground">{crumb.label}</span>
              )}
            </li>
          ))}
        </ol>
      </nav>
    )}
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="text-muted-foreground mt-1">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  </header>
);

export default PageHeader;
