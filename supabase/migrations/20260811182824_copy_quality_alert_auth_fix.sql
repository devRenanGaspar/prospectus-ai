-- ============================================================================
-- Corrige a autenticação de check_and_send_copy_quality_alert().
--
-- Achado ao testar: vault.decrypted_secrets está vazio neste projeto — o
-- secret `email_queue_service_role_key` (usado por email_queue_wake/
-- email_queue_dispatch, da infra de e-mail existente) não existe aqui.
-- Provável resíduo da importação do projeto Lovable: secrets do vault não
-- são carregados em snapshot/restore. Isso afeta também o auto-dispatch da
-- fila transacional/auth existente, não só este alerta novo — registrado
-- como achado separado, não corrigido nesta migration.
--
-- Em vez de depender dessa chave ausente (ou pedir a service_role key real
-- para recriá-la), usa o mesmo padrão já provado no projeto para chamadas
-- máquina-a-máquina sem JWT do Supabase: token compartilhado
-- (mesmo espírito do N8N_SHARED_TOKEN), gerado e guardado aqui mesmo via
-- pgcrypto, nunca exposto em texto puro fora do vault.
-- ============================================================================

DO $$
declare
  _existing_id uuid;
begin
  select id into _existing_id from vault.secrets where name = 'ops_alert_shared_token';
  if _existing_id is null then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'ops_alert_shared_token',
      'Token compartilhado para autenticar chamadas cron -> send-ops-alert (sem depender de JWT/service_role).'
    );
  end if;
end;
$$;

-- RPC que a Edge Function chama (via seu client service_role já funcional)
-- para validar o token, sem expor vault.* via PostgREST.
CREATE OR REPLACE FUNCTION public.verify_ops_alert_token(_token text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT _token IS NOT NULL AND _token = (
    SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'ops_alert_shared_token'
  );
$$;

REVOKE ALL ON FUNCTION public.verify_ops_alert_token(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_ops_alert_token(text) TO service_role;

COMMENT ON FUNCTION public.verify_ops_alert_token(text) IS
  'Valida o token compartilhado de send-ops-alert. Chamada só pelo client service_role da própria Edge Function.';

-- Reescreve o disparo para usar o token compartilhado em vez do vault secret ausente.
CREATE OR REPLACE FUNCTION private.check_and_send_copy_quality_alert()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
declare
  _latest timestamptz;
  _row record;
  _fired jsonb := '[]'::jsonb;
  _item jsonb;
  _rate_novo numeric;
  _rate_base numeric;
  _html text;
  _text text;
  _recipients text[];
  _token text;
begin
  select max(captured_at) into _latest from public.copy_quality_daily;
  if _latest is null then
    return false;
  end if;

  for _row in select * from public.copy_quality_daily where captured_at = _latest loop
    if _row.severity = 'metrica' then
      continue;
    end if;

    if _row.check_name in ('nota_maxima_indevida', 'nega_site_existente', 'nega_instagram_existente') then
      if _row.falhas_24h > 0 then
        _fired := _fired || jsonb_build_array(jsonb_build_object(
          'check_name', _row.check_name,
          'motivo', 'ocorrência nova — baseline histórico é zero/quase zero',
          'falhas_24h', _row.falhas_24h,
          'falhas_total', _row.falhas_total
        ));
      end if;
    else
      if _row.universo_24h >= 5 and _row.falhas_24h > 0 and _row.universo_total > 0 then
        _rate_novo := _row.falhas_24h::numeric / _row.universo_24h;
        _rate_base := _row.falhas_total::numeric / _row.universo_total;
        if _rate_base = 0 or _rate_novo > 2 * _rate_base then
          _fired := _fired || jsonb_build_array(jsonb_build_object(
            'check_name', _row.check_name,
            'motivo', 'taxa das últimas 24h mais que o dobro da taxa histórica',
            'taxa_24h_pct', round(_rate_novo * 100, 1),
            'taxa_historica_pct', round(_rate_base * 100, 1),
            'falhas_24h', _row.falhas_24h,
            'universo_24h', _row.universo_24h
          ));
        end if;
      end if;
    end if;
  end loop;

  if jsonb_array_length(_fired) = 0 then
    return false;
  end if;

  select array_agg(email) into _recipients
  from public.profiles where role = 'ADMIN' and email is not null and email <> '';

  if _recipients is null or array_length(_recipients, 1) = 0 then
    return false;
  end if;

  select decrypted_secret into _token from vault.decrypted_secrets where name = 'ops_alert_shared_token';
  if _token is null then
    raise warning 'check_and_send_copy_quality_alert: ops_alert_shared_token not found in vault';
    return false;
  end if;

  _html := '<h2>Grounding da copy fria — alerta (' || to_char(_latest, 'DD/MM/YYYY HH24:MI') || ' UTC)</h2><ul>';
  _text := 'Grounding da copy fria — alerta (' || to_char(_latest, 'DD/MM/YYYY HH24:MI') || ' UTC)' || chr(10) || chr(10);

  for _item in select * from jsonb_array_elements(_fired) loop
    _html := _html || '<li><b>' || (_item->>'check_name') || '</b>: ' || (_item->>'motivo')
      || ' — ' || coalesce(_item->>'falhas_24h', '0') || ' novo(s) em 24h'
      || case when _item->>'taxa_24h_pct' is not null
           then ' (taxa 24h ' || (_item->>'taxa_24h_pct') || '% vs. histórica ' || (_item->>'taxa_historica_pct') || '%)'
           else '' end
      || '</li>';
    _text := _text || '- ' || (_item->>'check_name') || ': ' || (_item->>'motivo')
      || ' — ' || coalesce(_item->>'falhas_24h', '0') || ' novo(s) em 24h'
      || case when _item->>'taxa_24h_pct' is not null
           then ' (taxa 24h ' || (_item->>'taxa_24h_pct') || '% vs. histórica ' || (_item->>'taxa_historica_pct') || '%)'
           else '' end
      || chr(10);
  end loop;

  _html := _html || '</ul><p>Consulte <code>public.ops_copy_quality</code> para os leads específicos e <code>public.copy_quality_daily</code> para o histórico.</p>';
  _text := _text || chr(10) || 'Consulte ops_copy_quality para os leads específicos e copy_quality_daily para o histórico.';

  begin
    perform net.http_post(
      url := 'https://tumqhovjzjojmrfoshou.supabase.co/functions/v1/send-ops-alert',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Ops-Alert-Token', _token
      ),
      body := jsonb_build_object(
        'subject', '[Prospectus] Grounding da copy fria — ' || jsonb_array_length(_fired) || ' alerta(s)',
        'html', _html,
        'text', _text,
        'to', to_jsonb(_recipients),
        'template', 'ops_copy_quality_alert'
      )
    );
  exception when others then
    raise warning 'check_and_send_copy_quality_alert: http_post failed: %', sqlerrm;
  end;

  return true;
end;
$$;

REVOKE ALL ON FUNCTION private.check_and_send_copy_quality_alert() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.check_and_send_copy_quality_alert() TO postgres;

COMMENT ON FUNCTION private.check_and_send_copy_quality_alert() IS
  'Cron-only: avalia o snapshot mais recente de copy_quality_daily e dispara e-mail (send-ops-alert) só em regressão real. Autentica com token compartilhado (vault: ops_alert_shared_token), não com JWT/service_role.';
