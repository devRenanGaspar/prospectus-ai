-- ============================================================================
-- C2 (sub-item) — Tirar o refresh token do Google de dentro de `profiles`
-- ============================================================================
-- Contexto (verificado no banco, não é teoria):
--   select has_column_privilege('authenticated','public.profiles',
--                               'google_calendar_refresh_token','SELECT');  -> true
--
--   O `REVOKE SELECT (google_calendar_refresh_token) ... FROM authenticated`
--   das migrations 20260512182022/183602 é um NO-OP: o role `authenticated`
--   tem SELECT no nível de TABELA, e no Postgres o grant de tabela cobre todas
--   as colunas — um revoke de coluna não o anula.
--
--   Consequência real: a RLS "Users can view own profile" deixa o usuário ler
--   o próprio token. E `useAdminUsers` faz `select("*")` em profiles, então o
--   painel de admin baixava os refresh tokens de TODOS os usuários pro browser.
--
-- Por que não corrigir com grants de coluna:
--   Exigiria `REVOKE SELECT ON profiles FROM authenticated` + `GRANT SELECT
--   (col1, col2, ...)`. Aí qualquer `select("*")` do PostgREST passa a falhar
--   (o `*` exige privilégio em todas as colunas), quebrando o painel de admin,
--   e toda coluna nova precisaria de GRANT manual.
--
-- Solução: mover a coluna para uma tabela própria, sem nenhum acesso para
--   anon/authenticated. Só service_role (edge functions) e postgres leem.
--   `google_calendar_email` e `google_calendar_connected_at` FICAM em profiles:
--   não são segredo e a UI os usa para mostrar o status da conexão.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_google_tokens (
  user_id       uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  refresh_token text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- RLS ligada e SEM policy nenhuma => authenticated/anon não leem nem escrevem.
-- service_role e o owner (postgres) passam por cima da RLS.
ALTER TABLE public.user_google_tokens ENABLE ROW LEVEL SECURITY;

-- Cinto e suspensório: nem privilégio de tabela os roles de cliente têm.
REVOKE ALL ON TABLE public.user_google_tokens FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.user_google_tokens TO service_role;

DROP TRIGGER IF EXISTS user_google_tokens_updated_at ON public.user_google_tokens;
CREATE TRIGGER user_google_tokens_updated_at
  BEFORE UPDATE ON public.user_google_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Migra os tokens existentes antes de dropar a coluna.
INSERT INTO public.user_google_tokens (user_id, refresh_token)
SELECT id, google_calendar_refresh_token
  FROM public.profiles
 WHERE google_calendar_refresh_token IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

ALTER TABLE public.profiles DROP COLUMN google_calendar_refresh_token;
