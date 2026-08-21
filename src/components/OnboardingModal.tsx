import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const ONBOARDING_SESSION_KEY = "onboarding_dismissed";

const OnboardingModal = () => {
  const { profile, user, refreshProfile } = useAuth();

  const shouldShow =
    !!user &&
    profile?.onboarding_completed === false &&
    !sessionStorage.getItem(ONBOARDING_SESSION_KEY);

  const [open, setOpen] = useState(shouldShow);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const handleClose = async () => {
    if (dontShowAgain && user) {
      await supabase
        .from("profiles")
        .update({ onboarding_completed: true })
        .eq("id", user.id);
      refreshProfile();
    } else {
      sessionStorage.setItem(ONBOARDING_SESSION_KEY, "true");
    }
    setOpen(false);
  };

  if (!shouldShow) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">
            Bem-vindo(a)! Assista o vídeo para entender como começar.
          </DialogTitle>
        </DialogHeader>

        <div className="w-full">
          <iframe
            src="https://player.scaleup.com.br/embed/b5d50cc0bf148a89b4820b7a636f0adf35125c04"
            title="Prospectus_Onboarding"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="w-full border-0 rounded-lg"
            style={{ aspectRatio: "16 / 9" }}
          />
        </div>

        <DialogFooter className="flex-col sm:flex-row items-start sm:items-center gap-4 sm:justify-between">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground">
            <Checkbox
              checked={dontShowAgain}
              onCheckedChange={(v) => setDontShowAgain(v === true)}
            />
            Não mostrar novamente
          </label>
          <Button onClick={handleClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OnboardingModal;
