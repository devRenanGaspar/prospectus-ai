import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useActiveAnnouncement } from "@/hooks/useActiveAnnouncement";
import { useState, useEffect } from "react";

const AnnouncementModal = () => {
  const { announcement, dismiss } = useActiveAnnouncement();
  const [open, setOpen] = useState(false);
  const announcementId = announcement?.id;

  useEffect(() => {
    if (announcementId) setOpen(true);
  }, [announcementId]);

  const handleClose = () => {
    if (!announcement) return;
    dismiss.mutate(announcement.id, {
      onSettled: () => setOpen(false),
    });
  };

  if (!announcement) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{announcement.title}</DialogTitle>
          <DialogDescription className="sr-only">Mensagem do administrador</DialogDescription>
        </DialogHeader>
        <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed py-2">
          {announcement.content}
        </div>
        <DialogFooter>
          <Button onClick={handleClose} disabled={dismiss.isPending}>
            {dismiss.isPending ? "Fechando..." : "Entendi"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AnnouncementModal;
