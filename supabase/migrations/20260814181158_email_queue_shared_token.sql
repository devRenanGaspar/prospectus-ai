-- ============================================================================
-- Corrige a autenticação de email_queue_dispatch() / email_queue_wake().
--
-- Achado (já registrado em 20260811150000_copy_quality_alert_auth_fix.sql):
-- vault.decrypted_secrets está vazio neste projeto — o secret
-- `email_queue_service_role_key` não existe. Resíduo de snapshot/restore:
-- secrets do vault não são carregados nesse processo. Isso deixava
-- `'Bearer ' || NULL` como header Authorization, e com
-- process-email-queue.verify_jwt=true o gateway rejeitava a chamada com 401
-- antes da função rodar — a cada 5 segundos, indefinidamente, sem nunca
-- drenar a fila.
--
-- Mesma correção já aplicada em 11/08 para check_and_send_copy_quality_alert():
-- token compartilhado (mesmo espírito do N8N_SHARED_TOKEN), gerado e guardado
-- aqui via pgcrypto, nunca exposto em texto puro fora do vault.
-- ============================================================================

DO $$
declare
  _existing_id uuid;
begin
  select id into _existing_id from vault.secrets where name = 'email_queue_shared_token';
  if _existing_id is null then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'email_queue_shared_token',
      'Token compartilhado para autenticar chamadas cron/trigger -> process-email-queue (sem depender de JWT/service_role).'
    );
  end if;
end;
$$;

-- RPC que a Edge Function chama (via seu client service_role já funcional)
-- para validar o token, sem expor vault.* via PostgREST.
CREATE OR REPLACE FUNCTION public.verify_email_queue_token(_token text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT _token IS NOT NULL AND _token = (
    SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_shared_token'
  );
$$;

REVOKE ALL ON FUNCTION public.verify_email_queue_token(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_email_queue_token(text) TO service_role;

COMMENT ON FUNCTION public.verify_email_queue_token(text) IS
  'Valida o token compartilhado de process-email-queue. Chamada só pelo client service_role da própria Edge Function.';

-- Reescreve o poller (cron de 5s) para usar o token compartilhado em vez do
-- vault secret ausente. Lógica de lock/unschedule preservada sem alteração.
CREATE OR REPLACE FUNCTION public.email_queue_dispatch()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pgmq.q_auth_emails)
     AND NOT EXISTS (SELECT 1 FROM pgmq.q_transactional_emails) THEN
    BEGIN
      PERFORM pg_catalog.pg_advisory_xact_lock(7700000000000001);
      IF EXISTS (SELECT 1 FROM pgmq.q_auth_emails)
         OR EXISTS (SELECT 1 FROM pgmq.q_transactional_emails) THEN
        RETURN;
      END IF;
      PERFORM cron.unschedule('process-email-queue');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'email_queue_dispatch: cron unschedule failed: %', SQLERRM;
    END;
    RETURN;
  END IF;

  IF (SELECT retry_after_until FROM public.email_send_state WHERE id = 1) > now() THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://tumqhovjzjojmrfoshou.supabase.co/functions/v1/process-email-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Lovable-Context', 'cron',
      'X-Email-Queue-Token', (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_shared_token'
      )
    ),
    body := '{}'::jsonb
  );
END;
$function$;

-- Reescreve o wake trigger (dispara no INSERT em qualquer fila de e-mail),
-- mesma correção.
CREATE OR REPLACE FUNCTION public.email_queue_wake()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(7700000000000001);
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-email-queue') THEN
    BEGIN
      PERFORM cron.schedule('process-email-queue', '5 seconds', $cron$ SELECT public.email_queue_dispatch(); $cron$);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'email_queue_wake: cron schedule failed: %', SQLERRM;
    END;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := 'https://tumqhovjzjojmrfoshou.supabase.co/functions/v1/process-email-queue',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Lovable-Context', 'cron',
        'X-Email-Queue-Token', (
          SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_shared_token'
        )
      ),
      body := '{}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'email_queue_wake failed (enqueue preserved): %', SQLERRM;
  RETURN NULL;
END;
$function$;
