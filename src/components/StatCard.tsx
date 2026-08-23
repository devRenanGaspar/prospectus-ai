import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: { value: string; positive: boolean };
  className?: string;
}

const StatCard = ({ label, value, icon: Icon, trend, className }: StatCardProps) => (
  <Card className={cn("border-border/50 hover:shadow-soft transition-all duration-300 group", className)}>
    <CardContent className="p-6">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          {trend && (
            <p className={cn("text-xs font-medium", trend.positive ? "text-success" : "text-destructive")}>
              {trend.positive ? "↑" : "↓"} {trend.value}
            </p>
          )}
        </div>
        <div className="rounded-lg bg-primary/10 p-2.5 group-hover:bg-primary/20 transition-colors">
          <Icon className="h-5 w-5 text-primary" />
        </div>
      </div>
    </CardContent>
  </Card>
);

export default StatCard;
