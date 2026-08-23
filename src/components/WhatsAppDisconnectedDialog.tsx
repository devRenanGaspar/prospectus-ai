import { useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface WhatsAppDisconnectedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const WhatsAppDisconnectedDialog = ({ open, onOpenChange }: WhatsAppDisconnectedDialogProps) => {
  const navigate = useNavigate();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            WhatsApp desconectado
          </DialogTitle>
          <DialogDescription>
            Sua conexão com o WhatsApp caiu ou está inativa. Reconecte em
            Configurações → Integrações para continuar enviando mensagens.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="premium"
            onClick={() => {
              onOpenChange(false);
              navigate("/settings");
            }}
          >
            Ir para Configurações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default WhatsAppDisconnectedDialog;
