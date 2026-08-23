import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export type WhatsAppStatus = "disconnected" | "pending" | "active";

interface QrData {
  base64: string;
  pairingCode: string;
}

export const useWhatsApp = () => {
  const { user, profile, profileStatus, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [qrData, setQrData] = useState<QrData | null>(null);
  const [showQrDialog, setShowQrDialog] = useState(false);
  const autoCheckedRef = useRef(false);

  const status: WhatsAppStatus = (profile?.whatsapp_status as WhatsAppStatus) ?? "disconnected";
  const connectedNumber: string | null = profile?.whatsapp_number ?? null;
  const connectedPhoto: string | null = profile?.whatsapp_photo ?? null;

  const connect = useCallback(async (phone: string) => {
    if (!user || !profile) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("webhook-proxy", {
        body: {
          type: "whatsapp",
          action: "connect_whatsapp",
          payload: {
            phone,
            user_name: profile.full_name ?? "",
            sdr_name: profile.sdr_name || "MarIA",
            n8n_workflow_id: profile.n8n_workflow_id ?? "",
          },
        },
      });

      if (error) throw error;

      // Special case: instance was already connected on N8N
      if (data?.instance_status === "active") {
        await supabase
          .from("profiles")
          .update({
            whatsapp_status: "active",
            whatsapp_number: data.instance_number || phone,
            whatsapp_photo: data.instance_photo || null,
            whatsapp_number_last: data.instance_number || phone,
          })
          .eq("id", user.id);
        await refreshProfile();
        toast.success("WhatsApp já estava conectado. Status atualizado!");
        return;
      }

      if (data?.base64 && data?.pairingCode) {
        setQrData({ base64: data.base64, pairingCode: data.pairingCode });
        setShowQrDialog(true);
        // Update local status to pending
        await supabase
          .from("profiles")
          .update({ whatsapp_status: "pending", whatsapp_number: phone, whatsapp_number_last: phone })
          .eq("id", user.id);
        await refreshProfile();
      } else {
        toast.error(data?.error || "Erro ao conectar WhatsApp.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao conectar WhatsApp.");
    } finally {
      setLoading(false);
    }
  }, [user, profile, refreshProfile]);

  const checkStatus = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("webhook-proxy", {
        body: {
          type: "whatsapp",
          action: "get_status",
        payload: {
            phone: connectedNumber || "",
            n8n_workflow_id: profile?.n8n_workflow_id ?? "",
          },
        },
      });

      if (error) throw error;

      if (data?.instance_status === "active") {
        await supabase
          .from("profiles")
          .update({
            whatsapp_status: "active",
            whatsapp_number: data.instance_number || null,
            whatsapp_photo: data.instance_photo || null,
            whatsapp_number_last: data.instance_number || null,
          })
          .eq("id", user.id);
        toast.success("WhatsApp conectado com sucesso!");
        setShowQrDialog(false);
        setQrData(null);
        await refreshProfile();
      } else {
        // Any non-active status (e.g. "deactived") = treat as disconnected
        await supabase
          .from("profiles")
          .update({
            whatsapp_status: "disconnected",
            whatsapp_number: null,
            whatsapp_photo: null,
          })
          .eq("id", user.id);
        setShowQrDialog(false);
        setQrData(null);
        await refreshProfile();
        toast.info("WhatsApp desconectado. Conecte novamente para usar.");
      }
    } catch (err) {
      setShowQrDialog(false);
      setQrData(null);
      await refreshProfile();
      toast.error(err instanceof Error ? err.message : "Erro ao verificar status. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }, [user, connectedNumber, profile, refreshProfile]);

  // Silent verification used as a guard before sending messages.
  // Does NOT show toasts. Returns true if instance is active, false otherwise
  // (including network/timeout errors — fail-closed to block sends).
  const verifyConnection = useCallback(async (): Promise<boolean> => {
    if (!user) return false;
    try {
      const { data, error } = await supabase.functions.invoke("webhook-proxy", {
        body: {
          type: "whatsapp",
          action: "get_status",
          payload: {
            phone: connectedNumber || profile?.whatsapp_number_last || "",
            n8n_workflow_id: profile?.n8n_workflow_id ?? "",
          },
        },
      });
      if (error) throw error;
      const isActive = data?.instance_status === "active";
      if (!isActive && status !== "disconnected") {
        await supabase
          .from("profiles")
          .update({
            whatsapp_status: "disconnected",
            whatsapp_number: null,
            whatsapp_photo: null,
          })
          .eq("id", user.id);
        await refreshProfile();
      } else if (isActive && status !== "active") {
        await supabase
          .from("profiles")
          .update({
            whatsapp_status: "active",
            whatsapp_number: data.instance_number || connectedNumber,
            whatsapp_photo: data.instance_photo || null,
          })
          .eq("id", user.id);
        await refreshProfile();
      }
      return isActive;
    } catch {
      return false;
    }
  }, [user, profile, connectedNumber, status, refreshProfile]);

  const disconnect = useCallback(async () => {
    if (!user || !profile) return;
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke("webhook-proxy", {
        body: {
          type: "whatsapp",
          action: "disconnect_whatsapp",
          payload: {
            phone: connectedNumber || profile?.whatsapp_number_last || "",
            n8n_workflow_id: profile.n8n_workflow_id ?? "",
          },
        },
      });
      if (error) throw error;

      await supabase
        .from("profiles")
        .update({
          whatsapp_status: "disconnected",
          whatsapp_number: null,
          whatsapp_photo: null,
        })
        .eq("id", user.id);

      toast.success("WhatsApp desconectado.");
      await refreshProfile();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao desconectar.");
    } finally {
      setLoading(false);
    }
  }, [user, profile, connectedNumber, refreshProfile]);

  // Auto-check status once the profile has settled -- not on mount. `status`
  // derives from `profile`, which is null on the first render of a hard load,
  // so an empty-dependency effect read "disconnected" and skipped the check
  // entirely: the feature only worked when arriving via client-side
  // navigation. The ref keeps it to a single run per mount.
  useEffect(() => {
    if (profileStatus !== "resolved" || autoCheckedRef.current) return;
    autoCheckedRef.current = true;
    if ((status === "pending" || status === "active") && (connectedNumber || profile?.whatsapp_number_last)) {
      checkStatus();
    }
  }, [profileStatus, status, connectedNumber, profile?.whatsapp_number_last, checkStatus]);

  return {
    status,
    connectedNumber,
    connectedPhoto,
    loading,
    qrData,
    showQrDialog,
    setShowQrDialog,
    connect,
    checkStatus,
    verifyConnection,
    disconnect,
  };
};
