export const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL?.trim() ?? "";
export const SUPPORT_WHATSAPP_DISPLAY =
  import.meta.env.VITE_SUPPORT_WHATSAPP_DISPLAY?.trim() ?? "";
export const SUPPORT_WHATSAPP_NUMBER =
  import.meta.env.VITE_SUPPORT_WHATSAPP_NUMBER?.replace(/\D/g, "") ?? "";

export const SUPPORT_WHATSAPP_URL = SUPPORT_WHATSAPP_NUMBER
  ? `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(
      "Olá! Preciso de ajuda com o Prospectus."
    )}`
  : "";

export const SUPPORT_EMAIL_URL = SUPPORT_EMAIL
  ? `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Suporte Prospectus")}`
  : "";
