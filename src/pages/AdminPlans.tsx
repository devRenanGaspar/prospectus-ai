import { useState } from "react";
import SEO from "@/components/SEO";
import PageHeader from "@/components/PageHeader";
import LoadingState from "@/components/LoadingState";
import ErrorState from "@/components/ErrorState";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Pencil, Link as LinkIcon, ExternalLink } from "lucide-react";
import { useAdminPlans, useUpsertPlan, useAdminCreditPackages, useUpsertCreditPackage } from "@/hooks/useAdmin";
import type { Database } from "@/integrations/supabase/types";

type PlanRow = Database["public"]["Tables"]["plans"]["Row"];
type CreditPackageRow = Database["public"]["Tables"]["credit_packages"]["Row"];

const AdminPlans = () => {
  const { data: plans = [], isLoading, isError, refetch } = useAdminPlans();
  const upsertPlan = useUpsertPlan();
  const { data: packages = [], isLoading: pkgLoading, isError: pkgIsError, refetch: refetchPkg } = useAdminCreditPackages();
  const upsertPkg = useUpsertCreditPackage();

  const [editing, setEditing] = useState<PlanRow | "new" | null>(null);
  const [form, setForm] = useState({ name: "", price_monthly: 0, credits_included: 0, features: "", is_active: true, payment_link: "" });

  const [editingPkg, setEditingPkg] = useState<CreditPackageRow | "new" | null>(null);
  const [pkgForm, setPkgForm] = useState({ credits: 0, price: 0, payment_link: "", is_active: true });

  // --- Plans ---
  const openNew = () => {
    setForm({ name: "", price_monthly: 0, credits_included: 0, features: "", is_active: true, payment_link: "" });
    setEditing("new");
  };

  const openEdit = (plan: PlanRow) => {
    setEditing(plan);
    setForm({
      name: plan.name,
      price_monthly: plan.price_monthly,
      credits_included: plan.credits_included,
      features: Array.isArray(plan.features) ? (plan.features as string[]).join("\n") : "",
      is_active: plan.is_active ?? true,
      payment_link: plan.payment_link ?? "",
    });
  };

  const handleSave = () => {
    const features = form.features.split("\n").map((f: string) => f.trim()).filter(Boolean);
    upsertPlan.mutate(
      {
        id: editing !== "new" ? editing?.id : undefined,
        name: form.name,
        price_monthly: form.price_monthly,
        credits_included: form.credits_included,
        features,
        is_active: form.is_active,
        payment_link: form.payment_link || undefined,
      },
      { onSuccess: () => setEditing(null) }
    );
  };

  // --- Credit Packages ---
  const openNewPkg = () => {
    setPkgForm({ credits: 0, price: 0, payment_link: "", is_active: true });
    setEditingPkg("new");
  };

  const openEditPkg = (pkg: CreditPackageRow) => {
    setEditingPkg(pkg);
    setPkgForm({
      credits: pkg.credits,
      price: pkg.price,
      payment_link: pkg.payment_link ?? "",
      is_active: pkg.is_active ?? true,
    });
  };

  const handleSavePkg = () => {
    upsertPkg.mutate(
      {
        id: editingPkg !== "new" ? editingPkg?.id : undefined,
        credits: pkgForm.credits,
        price: pkgForm.price,
        payment_link: pkgForm.payment_link || undefined,
        is_active: pkgForm.is_active,
      },
      { onSuccess: () => setEditingPkg(null) }
    );
  };

  return (
    <>
      <SEO title="Admin — Planos" description="Gerencie os planos disponíveis na plataforma." />
      <PageHeader
        title="Gerenciar Planos"
        description="Configure planos, preços, features e links de pagamento."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Admin" }, { label: "Planos" }]}
        actions={
          <Button variant="premium" size="sm" onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" /> Novo Plano
          </Button>
        }
      />

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading ? (
        <LoadingState variant="list" count={3} />
      ) : (
        <Card className="border-border/50 animate-fade-in">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Preço</TableHead>
                <TableHead>Créditos</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Link</TableHead>
                <TableHead>Features</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.map((plan) => (
                <TableRow key={plan.id}>
                  <TableCell className="font-medium">{plan.name}</TableCell>
                  <TableCell>R$ {plan.price_monthly}</TableCell>
                  <TableCell>{plan.credits_included}</TableCell>
                  <TableCell>
                    <Badge variant={plan.is_active ? "success" : "secondary"}>
                      {plan.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {plan.payment_link ? (
                      <a href={plan.payment_link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                        <ExternalLink className="h-3.5 w-3.5" /> Link
                      </a>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                    {Array.isArray(plan.features) ? (plan.features as string[]).join(", ") : "—"}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(plan)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Plan Dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Novo Plano" : "Editar Plano"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Nome</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Preço mensal (R$)</label>
                <Input type="number" min={0} value={form.price_monthly} onChange={(e) => setForm({ ...form, price_monthly: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Créditos inclusos</label>
                <Input type="number" min={0} value={form.credits_included} onChange={(e) => setForm({ ...form, credits_included: Number(e.target.value) })} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <LinkIcon className="h-3.5 w-3.5" /> Link de pagamento
              </label>
              <Input
                value={form.payment_link}
                onChange={(e) => setForm({ ...form, payment_link: e.target.value })}
                placeholder="https://pay.exemplo.com/plano-basico"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Features (uma por linha)</label>
              <textarea
                value={form.features}
                onChange={(e) => setForm({ ...form, features: e.target.value })}
                className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Feature 1&#10;Feature 2"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <label className="text-sm">Ativo</label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={upsertPlan.isPending || !form.name}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credit Packages Section */}
      <div className="mt-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Créditos Avulsos</h2>
            <p className="text-sm text-muted-foreground">Pacotes de créditos extras disponíveis para compra.</p>
          </div>
          <Button variant="premium" size="sm" onClick={openNewPkg}>
            <Plus className="h-4 w-4 mr-1" /> Novo Pacote
          </Button>
        </div>

        {pkgIsError ? (
          <ErrorState onRetry={() => refetchPkg()} />
        ) : pkgLoading ? (
          <LoadingState variant="list" count={2} />
        ) : (
          <Card className="border-border/50 animate-fade-in">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Créditos</TableHead>
                  <TableHead>Preço</TableHead>
                  <TableHead>Link</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {packages.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                      Nenhum pacote cadastrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  packages.map((pkg) => (
                    <TableRow key={pkg.id}>
                      <TableCell className="font-medium">{pkg.credits}</TableCell>
                      <TableCell>R$ {pkg.price}</TableCell>
                      <TableCell>
                        {pkg.payment_link ? (
                          <a href={pkg.payment_link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                            <ExternalLink className="h-3.5 w-3.5" /> Link
                          </a>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={pkg.is_active ? "success" : "secondary"}>
                          {pkg.is_active ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => openEditPkg(pkg)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      {/* Credit Package Dialog */}
      <Dialog open={!!editingPkg} onOpenChange={(open) => !open && setEditingPkg(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingPkg === "new" ? "Novo Pacote" : "Editar Pacote"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Créditos</label>
                <Input type="number" min={1} value={pkgForm.credits} onChange={(e) => setPkgForm({ ...pkgForm, credits: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Preço (R$)</label>
                <Input type="number" min={0} value={pkgForm.price} onChange={(e) => setPkgForm({ ...pkgForm, price: Number(e.target.value) })} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <LinkIcon className="h-3.5 w-3.5" /> Link de pagamento
              </label>
              <Input
                value={pkgForm.payment_link}
                onChange={(e) => setPkgForm({ ...pkgForm, payment_link: e.target.value })}
                placeholder="https://pay.exemplo.com/creditos-100"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={pkgForm.is_active} onCheckedChange={(v) => setPkgForm({ ...pkgForm, is_active: v })} />
              <label className="text-sm">Ativo</label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPkg(null)}>Cancelar</Button>
            <Button onClick={handleSavePkg} disabled={upsertPkg.isPending || pkgForm.credits < 1}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AdminPlans;
