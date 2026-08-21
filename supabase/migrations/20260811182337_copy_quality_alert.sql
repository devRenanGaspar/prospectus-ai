-- ============================================================================
-- Alerta por e-mail para regressão em ops_copy_quality (Grupo A).
--
-- Regra deliberadamente NÃO é "qualquer falha dispara e-mail" — isso
-- espamaria todo dia, porque pixel_sem_analise (41%) e reviews_superestimado
-- (2,7%) já são problemas crônicos conhecidos, não regressões.
--
--   Guardas de baseline zero (nota_maxima_indevida, nega_site_existente,
--   nega_instagram_existente) — histórico é 0-2 casos ever. Qualquer
--   ocorrência nova em 24h é, por definição, anômala. Dispara sempre.
--
--   Gates crônicos (reviews_superestimado, pixel_sem_analise) — só dispara
--   se a taxa das últimas 24h for mais que o dobro da taxa histórica
--   acumulada, com amostra mínima de 5 para não reagir a ruído de dia com
--   poucas copies geradas.
--
--   Métrica (avaliador_inexistente) — nunca dispara e-mail hoje; ainda
--   precisa do refino de regex (CP-T02) antes de virar gate.
--
-- Reaproveita a infra de e-mail já existente: função Edge send-ops-alert,
-- Resend via _shared/email-client.ts, e o mesmo vault secret
-- (`email_queue_service_role_key`) que process-email-queue já usa para
-- autenticar chamadas de cron→edge-function via pg_net.
-- ============================================================================

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
        'Authorization', 'Bearer ' || (
          select decrypted_secret from vault.decrypted_secrets where name = 'email_queue_service_role_key'
        )
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
  'Cron-only: avalia o snapshot mais recente de copy_quality_daily e dispara e-mail (send-ops-alert) só em regressão real — guardas de baseline zero disparam em qualquer ocorrência nova; gates crônicos só em taxa >2x a histórica, para não repetir alerta todo dia sobre problema já conhecido.';

-- Encadeia a checagem de alerta depois da captura, no mesmo job diário.
DO $$
declare
  _job_id bigint;
begin
  select jobid into _job_id from cron.job where jobname = 'capture-copy-quality-daily';
  if _job_id is not null then
    perform cron.unschedule(_job_id);
  end if;

  perform cron.schedule(
    'capture-copy-quality-daily',
    '0 6 * * *',
    $job$select private.capture_copy_quality_snapshot(); select private.check_and_send_copy_quality_alert();$job$
  );
end;
$$;
