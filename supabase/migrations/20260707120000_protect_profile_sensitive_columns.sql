-- ============================================================================
-- C2 — Impedir que o usuário altere diretamente credits_balance / plan_id
-- ============================================================================
-- Contexto:
--   A única proteção anterior era um REVOKE de coluna:
--     REVOKE UPDATE (credits_balance, plan_id) ON public.profiles FROM authenticated;
--   No Postgres, um REVOKE de coluna NÃO anula um GRANT de UPDATE no nível de
--   tabela — e o Supabase concede UPDATE de tabela ao role `authenticated` por
--   padrão. Resultado: o usuário conseguia se autoconceder créditos com
--     supabase.from('profiles').update({ credits_balance: 999999 }).eq('id', meuId)
--   (a RLS "Users can update own profile" só valida id = auth.uid()).
--
-- Estratégia:
--   Trigger BEFORE UPDATE que rejeita mudança nessas colunas quando o autor da
--   escrita é um role de usuário final (`authenticated`/`anon`). Escritas
--   legítimas continuam funcionando porque rodam com outro `current_user`:
--     - RPCs SECURITY DEFINER (deduct_credits, admin_update_user_profile,
--       refund_unused_search_credits) executam como o dono da função (postgres);
--     - Edge functions (n8n-proxy add_credits/renew) usam o role service_role;
--     - Edições pelo dashboard/Table Editor rodam como postgres/supabase_admin.
--   Todos esses têm current_user <> 'authenticated'/'anon' e passam.
--
-- Seguro para aplicar imediatamente: nenhum fluxo legítimo do app escreve
-- credits_balance/plan_id diretamente com o JWT do usuário.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.prevent_sensitive_profile_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF NEW.credits_balance IS DISTINCT FROM OLD.credits_balance THEN
      RAISE EXCEPTION 'Permission denied: credits_balance is read-only for users';
    END IF;
    IF NEW.plan_id IS DISTINCT FROM OLD.plan_id THEN
      RAISE EXCEPTION 'Permission denied: plan_id is read-only for users';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prevent_sensitive_profile_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_prevent_sensitive_update ON public.profiles;
CREATE TRIGGER profiles_prevent_sensitive_update
BEFORE UPDATE OF credits_balance, plan_id ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_sensitive_profile_update();

-- ----------------------------------------------------------------------------
-- Verificação pós-aplicação (rode no SQL editor; deve dar erro de permissão):
--   -- como usuário autenticado (via app / PostgREST):
--   update profiles set credits_balance = credits_balance + 1000 where id = auth.uid();
--   -- esperado: "Permission denied: credits_balance is read-only for users"
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- NOTA (leitura do refresh token do Google) — NÃO incluído aqui de propósito.
--   O REVOKE SELECT (google_calendar_refresh_token) sofre do mesmo problema de
--   grant de tabela. Corrigir a LEITURA exige revogar SELECT de tabela e
--   regrantear coluna a coluna, o que é frágil (esquecer uma coluna quebra
--   leituras do app). Verifique se está exposto com:
--     select has_column_privilege('authenticated','public.profiles',
--                                 'google_calendar_refresh_token','SELECT');
--   Se retornar true, o caminho recomendado é mover o token para uma tabela
--   separada acessível só por service_role (refactor à parte, testar em staging).
-- ----------------------------------------------------------------------------
