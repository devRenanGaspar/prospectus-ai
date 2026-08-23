import { useState } from "react";
import SEO from "@/components/SEO";
import PageHeader from "@/components/PageHeader";
import LoadingState from "@/components/LoadingState";
import ErrorState from "@/components/ErrorState";
import SearchInput from "@/components/SearchInput";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Pencil, Zap, Users, Send, MessageCircle, Search, Mail, Phone, MessageSquare, Calendar, RefreshCw, LogIn } from "lucide-react";
import { useAdminUsers, useUpdateUser, useAdminUserStats, useUpdateUserPassword, type AdminUserRow } from "@/hooks/useAdmin";
import { useImpersonate } from "@/hooks/useImpersonate";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { usePlans } from "@/hooks/usePlans";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import WhatsAppHistory from "@/components/WhatsAppHistory";

const AdminUsers = () => {
  const { data: users = [], isLoading, isError, refetch } = useAdminUsers();
  const { data: plans = [] } = usePlans();
  const updateUser = useUpdateUser();
  const updatePassword = useUpdateUserPassword();
  const impersonate = useImpersonate();
  const [confirmImpersonate, setConfirmImpersonate] = useState<AdminUserRow | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<AdminUserRow | null>(null);
  const [editRole, setEditRole] = useState("USER");
  const [editCredits, setEditCredits] = useState(0);
  const [editPlanId, setEditPlanId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editPassword, setEditPassword] = useState("");

  // Details dialog state
  const [detailUser, setDetailUser] = useState<AdminUserRow | null>(null);
  const { data: stats, isLoading: statsLoading } = useAdminUserStats(detailUser?.id ?? null);

  const filtered = users.filter((u) =>
    (u.full_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (u.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (u.sdr_phone ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (u.whatsapp_number ?? "").toLowerCase().includes(search.toLowerCase()) ||
    u.id.toLowerCase().includes(search.toLowerCase())
  );

  const openEdit = (user: AdminUserRow) => {
    setEditing(user);
    setEditRole(user.role);
    setEditCredits(user.credits_balance);
    setEditPlanId(user.plan_id);
    setEditName(user.full_name || "");
    setEditEmail(user.email || "");
    setEditPhone(user.sdr_phone || "");
    setEditPassword("");
  };

  const handleSave = () => {
    if (!editing) return;
    if (editPassword) {
      updatePassword.mutate({ user_id: editing.id, new_password: editPassword });
    }
    updateUser.mutate(
      { id: editing.id, role: editRole, credits_balance: editCredits, plan_id: editPlanId, full_name: editName, email: editEmail, sdr_phone: editPhone },
      { onSuccess: () => setEditing(null) }
    );
  };

  const statItems = [
    { label: "Leads encontrados", icon: Search, key: "leadsFound" as const },
    { label: "Mensagens enviadas", icon: Send, key: "messagesSent" as const },
    { label: "Leads que responderam", icon: Users, key: "responses" as const },
    { label: "Mensagens trocadas", icon: MessageCircle, key: "messagesExchanged" as const },
  ];

  return (
    <>
      <SEO title="Admin — Usuários" description="Gerencie os usuários da plataforma." />
      <PageHeader
        title="Gerenciar Usuários"
        description="Visualize e gerencie todos os usuários registrados."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Admin" }, { label: "Usuários" }]}
      />

      <div className="mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nome, email, telefone ou ID..." className="max-w-sm" />
      </div>

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading ? (
        <LoadingState variant="list" count={5} />
      ) : (
        <Card className="border-border/50 animate-fade-in">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Créditos</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((user) => (
                <TableRow
                  key={user.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setDetailUser(user)}
                >
                  <TableCell className="font-medium">{user.full_name || "Sem nome"}</TableCell>
                  <TableCell>
                    <Badge variant={user.role === "ADMIN" ? "default" : "secondary"}>{user.role}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{user.plans?.name ?? "Trial"}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1">
                      <Zap className="h-3.5 w-3.5 text-primary" /> {user.credits_balance}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(user.created_at), "dd/MM/yyyy", { locale: ptBR })}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => { e.stopPropagation(); openEdit(user); }}
                      aria-label="Editar usuário"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Details dialog */}
      <Dialog open={!!detailUser} onOpenChange={(open) => !open && setDetailUser(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{detailUser?.full_name || "Sem nome"}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant={detailUser?.role === "ADMIN" ? "default" : "secondary"}>{detailUser?.role}</Badge>
            <span>•</span>
            <span>{detailUser?.plans?.name ?? "Trial"}</span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Zap className="h-3.5 w-3.5 text-primary" /> {detailUser?.credits_balance} créditos
            </span>
          </div>

          {/* User info fields */}
          <div className="mt-3 space-y-2">
            {[
              { icon: Mail, label: "Email", value: detailUser?.email || "—" },
              { icon: Phone, label: "Telefone", value: detailUser?.sdr_phone || detailUser?.whatsapp_number || "—" },
              {
                icon: MessageSquare,
                label: "WhatsApp",
                value: detailUser?.whatsapp_status === "active" ? (
                  <Badge variant="success">Conectado</Badge>
                ) : (
                  <Badge variant="secondary">Desconectado</Badge>
                ),
              },
              {
                icon: Calendar,
                label: "Google Calendar",
                value: detailUser?.google_calendar_connected_at ? (
                  <span className="flex items-center gap-1.5">
                    <Badge variant="success">Conectado</Badge>
                    <span className="text-xs text-muted-foreground">{detailUser?.google_calendar_email}</span>
                  </span>
                ) : (
                  <Badge variant="secondary">Desconectado</Badge>
                ),
              },
              {
                icon: RefreshCw,
                label: "Renovação",
                value: (() => {
                  const subs = detailUser?.subscriptions;
                  const active = subs?.find((s) => s.status === "active");
                  return active?.current_period_end
                    ? format(new Date(active.current_period_end), "dd/MM/yyyy", { locale: ptBR })
                    : "Sem plano ativo";
                })(),
              },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center gap-3 rounded-md border border-border/50 px-3 py-2">
                <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm text-muted-foreground w-28 shrink-0">{label}</span>
                <span className="text-sm font-medium">{value}</span>
              </div>
            ))}
          </div>

          {/* Stats grid */}
          <div className="mt-4">
            <div className="grid grid-cols-3 gap-2 mb-2">
              <div />
              <div className="text-xs font-medium text-muted-foreground text-center">Últimos 30 dias</div>
              <div className="text-xs font-medium text-muted-foreground text-center">Total</div>
            </div>

            <div className="space-y-2">
              {statItems.map(({ label, icon: Icon, key }) => (
                <div key={key} className="grid grid-cols-3 gap-2 items-center rounded-md border border-border/50 px-3 py-2.5">
                  <div className="flex items-center gap-2 text-sm">
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate">{label}</span>
                  </div>
                  {statsLoading ? (
                    <>
                      <Skeleton className="h-5 w-12 mx-auto" />
                      <Skeleton className="h-5 w-12 mx-auto" />
                    </>
                  ) : (
                    <>
                      <div className="text-center font-semibold text-sm">{stats?.[key]?.last30 ?? 0}</div>
                      <div className="text-center font-semibold text-sm">{stats?.[key]?.total ?? 0}</div>
                    </>
                  )}
                </div>
              ))}
          </div>

          {/* WhatsApp history */}
          {detailUser && (
            <div className="mt-4">
              <div className="text-xs font-medium text-muted-foreground mb-2">Histórico WhatsApp</div>
              <WhatsAppHistory userId={detailUser.id} />
            </div>
          )}
          </div>

          <DialogFooter className="mt-2 gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setDetailUser(null)}>Fechar</Button>
            {detailUser && detailUser.role !== "ADMIN" && detailUser.role !== "BLOCKED" && (
              <Button
                variant="secondary"
                onClick={() => { setConfirmImpersonate(detailUser); setDetailUser(null); }}
              >
                <LogIn className="h-4 w-4 mr-1" /> Entrar como
              </Button>
            )}
            <Button onClick={() => { if (detailUser) openEdit(detailUser); setDetailUser(null); }}>
              <Pencil className="h-4 w-4 mr-1" /> Editar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Nome</label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nome completo" />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Email</label>
              <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="email@exemplo.com" />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Telefone</label>
              <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="+55 11 99999-9999" />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Role</label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USER">USER</SelectItem>
                  <SelectItem value="ADMIN">ADMIN</SelectItem>
                  <SelectItem value="BLOCKED">BLOCKED</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Plano</label>
              <Select value={editPlanId ?? "none"} onValueChange={(v) => setEditPlanId(v === "none" ? null : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum (Trial)</SelectItem>
                  {plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Créditos</label>
              <Input type="number" min={0} value={editCredits} onChange={(e) => setEditCredits(Number(e.target.value))} />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Nova senha</label>
              <Input type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} placeholder="Deixe vazio para não alterar" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={updateUser.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Impersonate confirmation */}
      <AlertDialog open={!!confirmImpersonate} onOpenChange={(open) => !open && setConfirmImpersonate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Entrar como {confirmImpersonate?.full_name || confirmImpersonate?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              Sua sessão de admin será encerrada e você entrará no sistema como este usuário, vendo exatamente o que ele vê.
              Para voltar à sua conta de admin, você precisará fazer login novamente.
              <br /><br />
              Esta ação será registrada no log de auditoria.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmImpersonate) impersonate.mutate(confirmImpersonate.id);
              }}
              disabled={impersonate.isPending}
            >
              {impersonate.isPending ? "Entrando..." : "Entrar como este usuário"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default AdminUsers;
