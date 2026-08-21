export const DEFAULT_BUSINESS_TYPE = "trafego_pago" as const;

export const BUSINESS_TYPE_LABELS = {
  trafego_pago: "Tráfego Pago",
  automacao_ia: "Automação e IA",
} as const;

export type BusinessType = keyof typeof BUSINESS_TYPE_LABELS;
