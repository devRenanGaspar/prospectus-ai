-- ============================================================================
-- A4 — Incluir 'BLOCKED' na constraint de role de profiles
-- ============================================================================
-- Contexto:
--   A constraint original é CHECK (role IN ('USER','ADMIN')). Nenhuma migration
--   a ampliou para 'BLOCKED', mas todo o recurso de bloqueio (is_active_user,
--   admin_update_user_profile, n8n-proxy set_user_access) grava role='BLOCKED'.
--   Ou isso foi alterado direto no dashboard (as migrations não refletem a
--   produção — risco em recriação de ambiente), ou o bloqueio falha silenciosa
--   com violação de constraint. Esta migration versiona o estado correto.
--
-- Idempotente e seguro: se a constraint já foi ampliada no dashboard, o
-- DROP IF EXISTS + ADD apenas a recria com a mesma definição. Linhas existentes
-- com role='BLOCKED' passam a ser válidas.
-- ============================================================================

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('USER', 'ADMIN', 'BLOCKED'));
