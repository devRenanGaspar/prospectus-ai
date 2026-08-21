import { useState } from "react";
import SEO from "@/components/SEO";
import PageHeader from "@/components/PageHeader";
import { useWebhookConfigs, type WebhookConfig } from "@/hooks/useWebhookConfigs";
import { N8N_EVENT_TYPES } from "@/lib/n8n-events";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Webhook } from "lucide-react";
import LoadingState from "@/components/LoadingState";
import ErrorState from "@/components/ErrorState";

interface FormData {
  id?: string;
  type: string;
  url: string;
  timeout_seconds: number;
  is_active: boolean;
}

const emptyForm: FormData = { type: "", url: "", timeout_seconds: 30, is_active: true };

const AdminWebhooks = () => {
  const { configs, isLoading, isError, refetch, upsert, remove } = useWebhookConfigs();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const openEdit = (c: WebhookConfig) => {
    setForm({ id: c.id, type: c.type, url: c.url, timeout_seconds: c.timeout_seconds, is_active: c.is_active });
    setFormOpen(true);
  };

  const handleSave = () => {
    if (!form.type || !form.url) return;
    upsert.mutate(form, { onSuccess: () => setFormOpen(false) });
  };

  return (
    <>
      <SEO title="Admin — Webhooks" description="Gerencie configurações de webhook." />
      <PageHeader
        title="Webhooks"
        description="Configure as URLs de webhook para integrações e automações."
        breadcrumbs={[{ label: "Admin" }, { label: "Webhooks" }]}
      />

      <Card className="border-border/50">
        <CardContent className="p-0">
          <div className="flex items-center justify-between p-4 border-b border-border/50">
            <div className="flex items-center gap-2">
              <Webhook className="h-5 w-5 text-primary" />
              <h3 className="font-medium">Configurações de Webhook</h3>
            </div>
            <Button size="sm" onClick={() => { setForm(emptyForm); setFormOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar
            </Button>
          </div>

          {isError ? (
            <div className="p-6"><ErrorState onRetry={() => refetch()} /></div>
          ) : isLoading ? (
            <div className="p-6"><LoadingState variant="list" count={3} /></div>
          ) : configs.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Nenhum webhook configurado.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead className="w-[100px]">Timeout (s)</TableHead>
                  <TableHead className="w-[80px]">Status</TableHead>
                  <TableHead className="w-[100px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configs.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs">{c.type}</TableCell>
                    <TableCell className="max-w-[300px] truncate text-xs">{c.url}</TableCell>
                    <TableCell>{c.timeout_seconds}s</TableCell>
                    <TableCell>
                      <Badge variant={c.is_active ? "default" : "secondary"}>
                        {c.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteId(c.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar" : "Adicionar"} Webhook</DialogTitle>
            <DialogDescription>Configure o tipo, URL e tempo limite do webhook.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                <SelectContent>
                  {N8N_EVENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>URL</Label>
              <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://..." />
            </div>
            <div className="space-y-2">
              <Label>Timeout (segundos)</Label>
              <Input type="number" value={form.timeout_seconds} onChange={(e) => setForm({ ...form, timeout_seconds: Number(e.target.value) })} />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <Label>Ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={upsert.isPending}>
              {upsert.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover webhook?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteId) remove.mutate(deleteId); setDeleteId(null); }}>
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default AdminWebhooks;
