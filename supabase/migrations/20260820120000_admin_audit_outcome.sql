-- ============================================================================
-- Audit a privileged action that could otherwise complete with no record
-- ============================================================================
-- `admin-update-password` and `admin-impersonate` wrote their audit log with
-- `await ... .insert({...})` and proceeded to a success response without
-- checking `error`. If the insert failed, the password was changed -- or the
-- magic link was minted -- and the record simply didn't exist. Nobody was
-- notified, and the caller saw 200.
--
-- An admin password change with no trace is worse than one that never
-- happened: the second gets retried, the first is never investigated.
--
-- The owner's decision was to record the INTENT before the action and abort
-- if the record can't be written. No privileged action happens without a
-- trace. That changes what the table means: it now records attempts, not
-- only consummated successes -- which is why the `outcome` column exists.
--
-- Migration 20260708120100 promises, in a comment, that the function will
-- "registrar aqui todo reset bem-sucedido". That promise is being
-- deliberately superseded, and strengthened: a record of attempts contains
-- the successes and also shows what failed. **That migration is not
-- edited** -- `docs/database-change-checklist.md` forbids rewriting a
-- migration that may already have run in another environment. This one
-- documents the transition; the old one stays as written.
--
-- Order matters. A plain `ADD COLUMN ... DEFAULT 'pending'` would mark
-- every existing row as a pending attempt. Measured against production:
-- `admin_password_reset_logs` has 0 rows and `admin_impersonation_logs` has
-- 38, all consummated successes. Marking them pending would trade a gap for
-- false evidence, the opposite of the goal. Hence: add nullable, reclassify
-- history, only then apply the default and NOT NULL.
--
-- Additive, no row rewritten, no DROP.
-- ============================================================================

-- 1) Coluna nulável, sem default: nada é afirmado sobre o histórico ainda.
ALTER TABLE public.admin_password_reset_logs
  ADD COLUMN IF NOT EXISTS outcome text;
ALTER TABLE public.admin_impersonation_logs
  ADD COLUMN IF NOT EXISTS outcome text;

-- 2) O histórico é explicitamente reclassificado. Toda linha que existe hoje
--    foi gravada DEPOIS da ação ter dado certo, pelo código antigo, então
--    'succeeded' é o que ela sempre significou.
UPDATE public.admin_password_reset_logs SET outcome = 'succeeded' WHERE outcome IS NULL;
UPDATE public.admin_impersonation_logs  SET outcome = 'succeeded' WHERE outcome IS NULL;

-- 3) Só agora o default, que vale para as linhas novas — as que registram a
--    intenção antes da ação.
ALTER TABLE public.admin_password_reset_logs
  ALTER COLUMN outcome SET DEFAULT 'pending';
ALTER TABLE public.admin_impersonation_logs
  ALTER COLUMN outcome SET DEFAULT 'pending';

ALTER TABLE public.admin_password_reset_logs
  ALTER COLUMN outcome SET NOT NULL;
ALTER TABLE public.admin_impersonation_logs
  ALTER COLUMN outcome SET NOT NULL;

-- 4) Os três estados são o vocabulário inteiro. Um quarto valor entrando por
--    engano vira erro de escrita, não uma linha que ninguém sabe ler.
ALTER TABLE public.admin_password_reset_logs
  DROP CONSTRAINT IF EXISTS admin_password_reset_logs_outcome_check;
ALTER TABLE public.admin_password_reset_logs
  ADD CONSTRAINT admin_password_reset_logs_outcome_check
  CHECK (outcome IN ('pending', 'succeeded', 'failed'));

ALTER TABLE public.admin_impersonation_logs
  DROP CONSTRAINT IF EXISTS admin_impersonation_logs_outcome_check;
ALTER TABLE public.admin_impersonation_logs
  ADD CONSTRAINT admin_impersonation_logs_outcome_check
  CHECK (outcome IN ('pending', 'succeeded', 'failed'));

COMMENT ON COLUMN public.admin_password_reset_logs.outcome IS
  'pending = intenção registrada, ação ainda não executada; succeeded = a senha foi trocada; failed = a troca falhou. Linhas anteriores a 2026-08-20 são todas succeeded: o código antigo só gravava depois do sucesso.';
COMMENT ON COLUMN public.admin_impersonation_logs.outcome IS
  'pending = intenção registrada, magic link ainda não gerado; succeeded = link gerado; failed = geração falhou. Linhas anteriores a 2026-08-20 são todas succeeded: o código antigo só gravava depois do sucesso.';

-- 5) Uma linha 'pending' que nunca virou nada é um sinal, não ruído: significa
--    que a function morreu entre o registro e a conclusão. Este índice existe
--    para que procurá-las seja barato.
CREATE INDEX IF NOT EXISTS idx_admin_pwd_reset_outcome
  ON public.admin_password_reset_logs (outcome, created_at DESC);
-- `admin_impersonation_logs` timestamps with `started_at`, not `created_at`;
-- as of 2026-08-20 only `admin_password_reset_logs` uses the latter. Assuming
-- the two tables were symmetric is what the CI migration replay caught here,
-- against a database rebuilt from the migrations alone.
CREATE INDEX IF NOT EXISTS idx_admin_impersonation_outcome
  ON public.admin_impersonation_logs (outcome, started_at DESC);

-- 6) Falha alto se algo acima não pegou. Uma migration que "roda" sem aplicar
--    o que promete e a mesma classe de defeito que a coluna outcome acima
--    existe para fechar.
DO $$
DECLARE
  missing int;
BEGIN
  SELECT count(*) INTO missing
  FROM (VALUES ('admin_password_reset_logs'), ('admin_impersonation_logs')) AS t(name)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = t.name AND column_name = 'outcome'
      AND is_nullable = 'NO' AND column_default LIKE '''pending''%'
  );
  IF missing > 0 THEN
    RAISE EXCEPTION 'outcome column missing or not defaulted on % audit table(s)', missing;
  END IF;

  IF EXISTS (SELECT 1 FROM public.admin_impersonation_logs WHERE outcome <> 'succeeded') THEN
    RAISE EXCEPTION 'pre-existing impersonation rows were not all reclassified as succeeded';
  END IF;
END $$;
