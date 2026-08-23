-- ============================================================================
-- M1 — Auditoria de reset de senha por admin
-- ============================================================================
-- A edge function admin-update-password permitia que QUALQUER admin trocasse a
-- senha de QUALQUER usuário — inclusive de outro ADMIN — e não deixava rastro
-- nenhum (diferente do admin-impersonate, que loga em admin_impersonation_logs).
-- Um admin podia assumir a conta de outro admin sem deixar registro.
--
-- Esta migration cria a tabela de auditoria. A function passa a:
--   1. recusar alvo com role='ADMIN' (exceto o próprio caller);
--   2. registrar aqui todo reset bem-sucedido.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.admin_password_reset_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id       uuid NOT NULL,
  target_user_id uuid NOT NULL,
  target_email   text,
  ip_address     text,
  user_agent     text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_pwd_reset_admin
  ON public.admin_password_reset_logs (admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_pwd_reset_target
  ON public.admin_password_reset_logs (target_user_id, created_at DESC);

ALTER TABLE public.admin_password_reset_logs ENABLE ROW LEVEL SECURITY;

-- Só admin lê. Ninguém escreve pelo cliente: a edge function usa service_role,
-- que passa por cima da RLS.
DROP POLICY IF EXISTS "Admins can read password reset logs" ON public.admin_password_reset_logs;
CREATE POLICY "Admins can read password reset logs"
  ON public.admin_password_reset_logs
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

REVOKE INSERT, UPDATE, DELETE ON public.admin_password_reset_logs FROM anon, authenticated;
