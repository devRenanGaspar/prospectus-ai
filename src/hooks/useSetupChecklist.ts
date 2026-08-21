import { useAuth } from "@/contexts/AuthContext";
import { useAgencyContext } from "@/hooks/useAgencyContext";

export interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
  href: string;
}

export const useSetupChecklist = () => {
  const { profile } = useAuth();
  const { data: agency, isLoading } = useAgencyContext();

  const items: ChecklistItem[] = [
    {
      id: "agency",
      label: "Dados da Agência",
      completed: !!agency?.name && agency.name.trim().length > 0,
      href: "/context",
    },
    {
      id: "persona",
      label: "Persona e Comunicação",
      completed: (() => {
        if (!agency?.context_persona) return false;
        try {
          const parsed = JSON.parse(agency.context_persona);
          return !!parsed.persona && parsed.persona.trim().length > 0;
        } catch {
          return agency.context_persona.trim().length > 0;
        }
      })(),
      href: "/context",
    },
    {
      id: "icp",
      label: "Perfil Ideal de Cliente (ICP)",
      completed: !!agency?.context_icp?.nichoPrincipal && agency.context_icp.nichoPrincipal.trim().length > 0,
      href: "/context",
    },
    {
      id: "qualification",
      label: "Critérios de Qualificação",
      completed:
        !!agency?.context_qualification?.superQualificado &&
        agency.context_qualification.superQualificado.filter((s: string) => s.trim().length > 0).length > 0,
      href: "/context",
    },
    {
      id: "whatsapp",
      label: "Conectar WhatsApp",
      completed: profile?.whatsapp_status === "active",
      href: "/settings",
    },
  ];

  const completedCount = items.filter((i) => i.completed).length;
  const allCompleted = completedCount === items.length;

  return { items, completedCount, totalCount: items.length, allCompleted, isLoading };
};
