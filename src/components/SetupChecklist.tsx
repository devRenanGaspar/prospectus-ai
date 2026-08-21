import { useSetupChecklist } from "@/hooks/useSetupChecklist";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, ArrowRight, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

const SetupChecklist = () => {
  const { items, completedCount, totalCount, allCompleted, isLoading } = useSetupChecklist();

  if (isLoading || allCompleted) return null;

  const progressPercent = Math.round((completedCount / totalCount) * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="mb-8"
    >
      <Card className="border-primary/20 bg-card/80 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            <CardTitle className="text-base font-semibold">
              Configure sua conta para começar
            </CardTitle>
          </div>
          <div className="flex items-center gap-3 mt-3">
            <Progress value={progressPercent} className="h-2 flex-1" />
            <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">
              {completedCount}/{totalCount}
            </span>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <ul className="space-y-1.5">
            <AnimatePresence mode="popLayout">
              {items.map((item) => (
                <motion.li
                  key={item.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2 }}
                >
                  {item.completed ? (
                    <div className="flex items-center gap-2.5 py-1.5 px-2 rounded-md">
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                      <span className="text-sm text-muted-foreground line-through">
                        {item.label}
                      </span>
                    </div>
                  ) : (
                    <Link
                      to={item.href}
                      className="flex items-center gap-2.5 py-1.5 px-2 rounded-md hover:bg-accent/50 transition-colors group"
                    >
                      <Circle className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                      <span className="text-sm font-medium flex-1">{item.label}</span>
                      <span className="text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                        Preencher <ArrowRight className="h-3 w-3" />
                      </span>
                    </Link>
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default SetupChecklist;
