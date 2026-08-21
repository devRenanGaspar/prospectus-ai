import { useState } from "react";
import SEO from "@/components/SEO";
import PageHeader from "@/components/PageHeader";
import LoadingState from "@/components/LoadingState";
import ErrorState from "@/components/ErrorState";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useAdminCosts, useUpsertCost, useDeleteCost } from "@/hooks/useAdmin";
import type { Database } from "@/integrations/supabase/types";

type CostRow = Database["public"]["Tables"]["credit_costs"]["Row"];

const AdminCosts = () => {
  const { data: costs = [], isLoading, isError, refetch } = useAdminCosts();
  const upsertCost = useUpsertCost();
  const deleteCost = useDeleteCost();
  const [editing, setEditing] = useState<CostRow | "new" | null>(null);
  const [form, setForm] = useState({ action_name: "", cost: 0 });

  const openNew = () => {
    setForm({ action_name: "", cost: 0 });
    setEditing("new");
  };

  const openEdit = (cost: CostRow) => {
    setEditing(cost);
    setForm({ action_name: cost.action_name, cost: cost.cost });
  };

  const handleSave = () => {
    upsertCost.mutate(
      { id: editing !== "new" ? editing?.id : undefined, action_name: form.action_name, cost: form.cost },
      { onSuccess: () => setEditing(null) }
    );
  };

  return (
    <>
      <SEO title="Admin — Custos" description="Configure o custo de cada ação na plataforma." />
      <PageHeader
        title="Custos por Ação"
        description="Defina quantos créditos cada ação consome."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Admin" }, { label: "Custos" }]}
        actions={
          <Button variant="premium" size="sm" onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" /> Novo Custo
          </Button>
        }
      />

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading ? (
        <LoadingState variant="list" count={4} />
      ) : (
        <Card className="border-border/50 animate-fade-in">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ação</TableHead>
                <TableHead>Custo (créditos)</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {costs.map((cost) => (
                <TableRow key={cost.id}>
                  <TableCell className="font-medium">{cost.action_name}</TableCell>
                  <TableCell>{cost.cost} cr</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(cost)} aria-label="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="Remover">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remover custo?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Tem certeza que deseja remover o custo para "{cost.action_name}"? Esta ação não pode ser desfeita.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteCost.mutate(cost.id)}>
                              Remover
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Novo Custo" : "Editar Custo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Nome da ação</label>
              <Input value={form.action_name} onChange={(e) => setForm({ ...form, action_name: e.target.value })} placeholder="Ex: FIND_LEAD" />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Custo (créditos)</label>
              <Input type="number" min={0} value={form.cost} onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={upsertCost.isPending || !form.action_name}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AdminCosts;
