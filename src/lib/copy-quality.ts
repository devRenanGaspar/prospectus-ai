import type { SignalLevel } from "@/lib/system-health";

export interface CopyQualityCheck {
  test_id: string;
  check_name: string;
  severity: "gate" | "metrica";
  universo_total: number;
  falhas_total: number;
  taxa_total_pct: number | null;
  universo_24h: number;
  falhas_24h: number;
  taxa_24h_pct: number | null;
  is_regression: boolean;
}

export interface CopyQualitySnapshot {
  last_captured_at: string | null;
  schedule: string | null;
  job_active: boolean | null;
  last_run: { start_time: string; status: string } | null;
  last_alert_sent_at: string | null;
  checks: CopyQualityCheck[];
}

export const checkLabels: Record<string, string> = {
  reviews_superestimado: "Nº de avaliações inflado",
  nota_superestimada: "Nota do Google inflada",
  nota_maxima_indevida: "“Nota máxima” indevida",
  avaliador_inexistente: "Avaliador citado não existe",
  pixel_sem_analise: "Nega pixel sem base",
  nega_site_existente: "Nega site que existe",
  nega_instagram_existente: "Nega Instagram que existe",
  avaliador_insatisfeito_citado: "Cita avaliador insatisfeito pelo nome",
  linguagem_garantia_indevida: "Linguagem de garantia/promessa",
};

export function getCheckLabel(checkName: string) {
  return checkLabels[checkName] ?? checkName;
}

/**
 * Same reading of "healthy" used by the email alert
 * (private.check_and_send_copy_quality_alert): red only for a new
 * regression, yellow for the already-known chronic backlog
 * (pixel_sem_analise, reviews_superestimado), green only when there's no
 * failure at all.
 */
export function getCopyQualityLevel(snapshot: CopyQualitySnapshot): SignalLevel {
  if (snapshot.checks.length === 0) return "unknown";
  if (snapshot.checks.some((c) => c.is_regression)) return "critical";
  if (snapshot.checks.some((c) => c.falhas_total > 0)) return "warning";
  return "healthy";
}

export function getCronRunLevel(snapshot: CopyQualitySnapshot): SignalLevel {
  if (!snapshot.job_active) return "critical";
  if (!snapshot.last_captured_at) return "unknown";

  const ageMs = Date.now() - new Date(snapshot.last_captured_at).getTime();
  if (ageMs > 30 * 60 * 60 * 1000) return "critical"; // > 30h: perdeu o disparo diário
  if (ageMs > 26 * 60 * 60 * 1000) return "warning"; // passou de 24h+margem
  return "healthy";
}

export function formatPercent(value: number | null) {
  if (value === null) return "—";
  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}
