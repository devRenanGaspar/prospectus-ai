import { LucideIcon, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}

const EmptyState = ({ icon: Icon = Inbox, title, description, action, className }: EmptyStateProps) => (
  <div className={cn("flex flex-col items-center justify-center py-16 text-center animate-fade-in", className)}>
    <div className="rounded-2xl bg-muted p-4 mb-4">
      <Icon className="h-8 w-8 text-muted-foreground" />
    </div>
    <h3 className="text-lg font-semibold mb-1">{title}</h3>
    <p className="text-sm text-muted-foreground max-w-sm mb-6">{description}</p>
    {action && (
      <Button variant="premium" onClick={action.onClick}>
        {action.label}
      </Button>
    )}
  </div>
);

export default EmptyState;
