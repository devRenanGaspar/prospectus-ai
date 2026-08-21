import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Pencil, Trash2, Plus } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import LoadingState from "@/components/LoadingState";
import ErrorState from "@/components/ErrorState";

interface Announcement {
  id: string;
  title: string;
  content: string;
  is_active: boolean;
  created_at: string;
  created_by: string | null;
}

const AdminAnnouncements = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isActive, setIsActive] = useState(true);

  const { data: announcements, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-announcements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("announcements")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Announcement[];
    },
  });

  const { data: dismissalCounts } = useQuery({
    queryKey: ["admin-announcement-dismissals", announcements?.map((a) => a.id).join(",")],
    enabled: !!announcements && announcements.length > 0,
    queryFn: async () => {
      const ids = announcements!.map((a) => a.id);
      const { data, error } = await supabase
        .from("announcement_dismissals")
        .select("announcement_id")
        .in("announcement_id", ids);
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((d) => {
        counts[d.announcement_id] = (counts[d.announcement_id] ?? 0) + 1;
      });
      return counts;
    },
  });

  const resetForm = () => {
    setTitle("");
    setContent("");
    setIsActive(true);
    setEditing(null);
    setCreating(false);
  };

  const openCreate = () => {
    resetForm();
    setCreating(true);
  };

  const openEdit = (a: Announcement) => {
    setEditing(a);
    setTitle(a.title);
    setContent(a.content);
    setIsActive(a.is_active);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!title.trim() || !content.trim()) {
        throw new Error("Título e conteúdo são obrigatórios");
      }
      if (editing) {
        const { error } = await supabase
          .from("announcements")
          .update({ title: title.trim(), content: content.trim(), is_active: isActive })
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("announcements").insert({
          title: title.trim(),
          content: content.trim(),
          is_active: isActive,
          created_by: user?.id ?? null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-announcements"] });
      queryClient.invalidateQueries({ queryKey: ["active-announcement"] });
      toast({ title: editing ? "Mensagem atualizada" : "Mensagem criada" });
      resetForm();
    },
    onError: (err: Error) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase.from("announcements").update({ is_active: value }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-announcements"] });
      queryClient.invalidateQueries({ queryKey: ["active-announcement"] });
    },
    onError: (err: Error) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("announcements").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-announcements"] });
      queryClient.invalidateQueries({ queryKey: ["active-announcement"] });
      toast({ title: "Mensagem removida" });
      setDeletingId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const dialogOpen = creating || !!editing;

  return (
    <div className="flex flex-col gap-6 overflow-auto">
      <PageHeader
        title="Mensagens"
        description="Cadastre avisos que aparecem como popup uma única vez para usuários cadastrados antes da criação da mensagem."
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Nova mensagem
          </Button>
        }
      />

      <Card className="p-0 overflow-hidden">
        {isError ? (
          <div className="p-6">
            <ErrorState onRetry={() => refetch()} />
          </div>
        ) : isLoading ? (
          <div className="p-6">
            <LoadingState variant="list" count={3} />
          </div>
        ) : !announcements || announcements.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">
            Nenhuma mensagem cadastrada ainda.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Criada em</TableHead>
                <TableHead>Leitores</TableHead>
                <TableHead className="w-32 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {announcements.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium max-w-md truncate">{a.title}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={a.is_active}
                        onCheckedChange={(v) => toggleActive.mutate({ id: a.id, value: v })}
                      />
                      <Badge variant={a.is_active ? "default" : "secondary"}>
                        {a.is_active ? "Ativa" : "Inativa"}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(a.created_at).toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell className="text-sm">
                    {dismissalCounts?.[a.id] ?? 0}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center gap-1 justify-end">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(a)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeletingId(a.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(o) => !o && resetForm()}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar mensagem" : "Nova mensagem"}</DialogTitle>
            <DialogDescription>
              {editing
                ? `Esta mensagem é exibida para usuários cadastrados antes de ${new Date(
                    editing.created_at,
                  ).toLocaleString("pt-BR")}.`
                : "A mensagem só aparecerá para usuários já cadastrados no momento em que você criar este aviso. Novos usuários não verão."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="title">Título</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Atualização importante"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="content">Conteúdo</Label>
              <Textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Mensagem que será exibida ao usuário..."
                rows={6}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch id="active" checked={isActive} onCheckedChange={setIsActive} />
              <Label htmlFor="active" className="cursor-pointer">
                Ativa
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={resetForm} disabled={saveMutation.isPending}>
              Cancelar
            </Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover mensagem?</AlertDialogTitle>
            <AlertDialogDescription>
              A mensagem e todos os registros de quem já fechou serão removidos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingId && deleteMutation.mutate(deletingId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminAnnouncements;
