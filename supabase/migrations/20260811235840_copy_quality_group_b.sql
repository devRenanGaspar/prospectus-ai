-- ============================================================================
-- Grupo B do gold set de qualidade da copy fria (risco de marca) —
-- CP-T10 (avaliador insatisfeito citado pelo nome) e CP-T11 (linguagem de
-- garantia/promessa). Ver docs/operations/gold-set-copy-tests.md.local para a
-- revisão que cortou o Grupo B de 5 testes para 2 (nomear pessoa física
-- parqueado por decisão de produto pendente; reclamação-como-gancho e valor
-- em R$ cortados por falta de violação real medida).
--
-- Reaproveita a mesma view/tabela/cron/alerta do Grupo A (20260811130000 e
-- seguintes) — só adiciona 2 CTEs à view e 2 checks ao snapshot, nenhuma
-- infraestrutura nova.
--
--   CP-T10 · gate · avaliador citado pelo nome tem, no próprio review,
--            rating <= 2 (mesmo extrator de nome do CP-T02)
--   CP-T11 · gate · linguagem de garantia/promessa presente na copy
--
-- Tier de alerta: CP-T11 entra na lista de "qualquer ocorrência dispara"
-- (baseline 0,3%, mesmo perfil de nota_maxima_indevida). CP-T10 fica no tier
-- crônico (taxa >2x a histórica) porque já tem backlog relevante (6,1%) —
-- alertar em toda ocorrência seria ruído do que já é comportamento conhecido,
-- não regressão.
-- ============================================================================

CREATE OR REPLACE VIEW public.ops_copy_quality
WITH (security_invoker = true) AS
WITH base AS (
  SELECT
    l.id AS lead_id,
    l.user_id,
    l.city,
    l.mensagem_abordagem_comercial AS copy,
    l.reviews_count,
    l.total_score,
    l.website,
    l.website_analysis,
    l.instagram
  FROM public.leads l
  WHERE l.mensagem_abordagem_comercial IS NOT NULL
    AND length(l.mensagem_abordagem_comercial) > 10
    -- R7: exclusão heurística de leads de seed/demo (ver gold-set-restrictions-plan.md.local)
    AND l.id::text NOT LIKE 'd1e1%'
    AND coalesce(l.company_name, '') !~* 'teste|test |exemplo|demo|lorem'
),
t01_reviews AS (
  SELECT lead_id, user_id, 'CP-T01' AS test_id, 'reviews_superestimado' AS check_name, 'gate' AS severity,
    jsonb_build_object('citado', citado::numeric, 'real', reviews_count::numeric) AS context
  FROM (
    SELECT b.lead_id, b.user_id, b.reviews_count,
      replace((regexp_match(b.copy, '([0-9][0-9\.]{0,6})\s*(avalia[çc][õo]es|reviews)'))[1], '.', '') AS citado
    FROM base b
    WHERE b.copy ~* '[0-9][0-9\.]{0,6}\s*(avalia[çc][õo]es|reviews)'
      AND b.reviews_count ~ '^[0-9]+$'
  ) x
  WHERE citado::numeric > reviews_count::numeric
),
t01_nota AS (
  SELECT lead_id, user_id, 'CP-T01' AS test_id, 'nota_superestimada' AS check_name, 'gate' AS severity,
    jsonb_build_object('citado', nota_citada::numeric, 'real', total_score::numeric) AS context
  FROM (
    SELECT b.lead_id, b.user_id, b.total_score,
      replace((regexp_match(b.copy, 'nota\s*(?:de\s*)?([0-9](?:[,\.][0-9])?)'))[1], ',', '.') AS nota_citada
    FROM base b
    WHERE b.copy ~* 'nota\s*(?:de\s*)?[0-9]'
      AND b.total_score ~ '^[0-9](\.[0-9])?$'
  ) x
  WHERE nota_citada IS NOT NULL AND nota_citada::numeric > total_score::numeric
),
t01_nota_maxima AS (
  SELECT b.lead_id, b.user_id, 'CP-T01' AS test_id, 'nota_maxima_indevida' AS check_name, 'gate' AS severity,
    jsonb_build_object('real', b.total_score::numeric) AS context
  FROM base b
  WHERE b.copy ~* 'nota\s*m[áa]xima'
    AND b.total_score ~ '^[0-9](\.[0-9])?$'
    AND b.total_score::numeric < 5
),
t02_avaliador AS (
  SELECT b.lead_id, b.user_id, 'CP-T02' AS test_id, 'avaliador_inexistente' AS check_name, 'metrica' AS severity,
    jsonb_build_object('nome_citado', nome) AS context
  FROM (
    SELECT b.*,
      (regexp_match(b.copy,
        '(?:coment[áa]rio d[aeo]|review d[aeo]|avalia[çc][ãa]o d[aeo]|[oa])\s+([A-ZÁÂÃÉÊÍÓÔÕÚ][a-záâãéêíóôõúç]{2,15})\s+(?:fala|falou|escreveu|comentou|disse|destac|chamou|citou|elogi)'
      ))[1] AS nome
    FROM base b
  ) b
  WHERE nome IS NOT NULL
    -- heurística conhecida: exclui termos de plataforma/marca e substring do nome da cidade
    -- (ex.: "Grande" capturado de "Campina Grande") — ver CP-T02 no doc, ainda não é gate
    AND nome NOT IN ('Google', 'Instagram', 'Facebook', 'WhatsApp', 'Meta', 'News', 'Youtube', 'Yelp')
    AND NOT (b.city IS NOT NULL AND position(nome IN b.city) > 0)
    AND NOT EXISTS (
      SELECT 1 FROM public.lead_comments c
      WHERE c.lead_id = b.lead_id AND c.author_name ILIKE '%' || nome || '%'
    )
),
t03_pixel AS (
  SELECT b.lead_id, b.user_id, 'CP-T03' AS test_id, 'pixel_sem_analise' AS check_name, 'gate' AS severity,
    '{}'::jsonb AS context
  FROM base b
  WHERE b.copy ~* 'n[ãa]o (tem|possui|encontrei|achei|identifiquei)[^\.]{0,30}pixel'
    AND coalesce(b.website_analysis, '') = ''
),
t04_site AS (
  SELECT b.lead_id, b.user_id, 'CP-T04' AS test_id, 'nega_site_existente' AS check_name, 'gate' AS severity,
    jsonb_build_object('website', b.website) AS context
  FROM base b
  WHERE b.copy ~* 'n[ãa]o (tem|possui)[^\.]{0,25}site'
    AND b.website IS NOT NULL AND b.website <> ''
),
t04_instagram AS (
  SELECT b.lead_id, b.user_id, 'CP-T04' AS test_id, 'nega_instagram_existente' AS check_name, 'gate' AS severity,
    jsonb_build_object('instagram', b.instagram) AS context
  FROM base b
  WHERE b.copy ~* 'n[ãa]o (tem|possui)[^\.]{0,25}instagram'
    AND b.instagram IS NOT NULL AND b.instagram <> ''
),
t10_avaliador_insatisfeito AS (
  -- Mesmo extrator de nome do CP-T02, mas exige que o nome EXISTA em
  -- lead_comments (senão é caso do CP-T02, não deste) com rating <= 2.
  SELECT x.lead_id, x.user_id, 'CP-T10' AS test_id, 'avaliador_insatisfeito_citado' AS check_name, 'gate' AS severity,
    jsonb_build_object('nome_citado', x.nome, 'rating', c.rating) AS context
  FROM (
    SELECT b.*,
      (regexp_match(b.copy,
        '(?:coment[áa]rio d[aeo]|review d[aeo]|avalia[çc][ãa]o d[aeo]|[oa])\s+([A-ZÁÂÃÉÊÍÓÔÕÚ][a-záâãéêíóôõúç]{2,15})\s+(?:fala|falou|escreveu|comentou|disse|destac|chamou|citou|elogi)'
      ))[1] AS nome
    FROM base b
  ) x
  JOIN public.lead_comments c ON c.lead_id = x.lead_id AND c.author_name ILIKE '%' || x.nome || '%'
  WHERE x.nome IS NOT NULL
    AND x.nome NOT IN ('Google', 'Instagram', 'Facebook', 'WhatsApp', 'Meta', 'News', 'Youtube', 'Yelp')
    AND NOT (x.city IS NOT NULL AND position(x.nome IN x.city) > 0)
    AND c.rating <= 2
),
t11_garantia AS (
  SELECT b.lead_id, b.user_id, 'CP-T11' AS test_id, 'linguagem_garantia_indevida' AS check_name, 'gate' AS severity,
    '{}'::jsonb AS context
  FROM base b
  WHERE b.copy ~* '(garantimos|garantido|garantia de resultado|prometo|promessa de resultado|triplicar|100%|com certeza vai)'
)
SELECT * FROM t01_reviews
UNION ALL SELECT * FROM t01_nota
UNION ALL SELECT * FROM t01_nota_maxima
UNION ALL SELECT * FROM t02_avaliador
UNION ALL SELECT * FROM t03_pixel
UNION ALL SELECT * FROM t04_site
UNION ALL SELECT * FROM t04_instagram
UNION ALL SELECT * FROM t10_avaliador_insatisfeito
UNION ALL SELECT * FROM t11_garantia;

COMMENT ON VIEW public.ops_copy_quality IS
  'Grounding e risco de marca da copy fria (CP-T01..T04, CP-T10..T11) — uma linha por violação encontrada. Admin-only via RLS invocada das tabelas base.';

REVOKE ALL ON public.ops_copy_quality FROM anon;

-- ----------------------------------------------------------------------------
-- Snapshot diário: adiciona os 2 novos checks ao mesmo loop existente.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.capture_copy_quality_snapshot()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
declare
  _captured_at timestamptz := now();
  _checks record;
  _n integer := 0;
  _universo_total integer;
  _falhas_total integer;
  _universo_24h integer;
  _falhas_24h integer;
begin
  for _checks in
    select * from (values
      ('CP-T01','reviews_superestimado','gate'),
      ('CP-T01','nota_superestimada','gate'),
      ('CP-T01','nota_maxima_indevida','gate'),
      ('CP-T02','avaliador_inexistente','metrica'),
      ('CP-T03','pixel_sem_analise','gate'),
      ('CP-T04','nega_site_existente','gate'),
      ('CP-T04','nega_instagram_existente','gate'),
      ('CP-T10','avaliador_insatisfeito_citado','gate'),
      ('CP-T11','linguagem_garantia_indevida','gate')
    ) as t(test_id, check_name, severity)
  loop
    select count(*) into _falhas_total
    from public.ops_copy_quality q
    where q.check_name = _checks.check_name;

    select count(*) into _falhas_24h
    from public.ops_copy_quality q
    join public.leads l on l.id = q.lead_id
    where q.check_name = _checks.check_name
      and l.updated_at >= _captured_at - interval '24 hours';

    -- universo: leads elegíveis a essa checagem específica, não todas as copies
    -- (ex.: T03 só considera copies que mencionam pixel; T11 não tem
    -- pré-condição, então o universo é o corpus inteiro elegível).
    select count(*) into _universo_total
    from public.leads l
    where l.mensagem_abordagem_comercial is not null
      and length(l.mensagem_abordagem_comercial) > 10
      and l.id::text not like 'd1e1%'
      and coalesce(l.company_name, '') !~* 'teste|test |exemplo|demo|lorem'
      and (
        (_checks.check_name in ('reviews_superestimado') and l.mensagem_abordagem_comercial ~* '[0-9][0-9\.]{0,6}\s*(avalia[çc][õo]es|reviews)' and l.reviews_count ~ '^[0-9]+$')
        or (_checks.check_name = 'nota_superestimada' and l.mensagem_abordagem_comercial ~* 'nota\s*(?:de\s*)?[0-9]' and l.total_score ~ '^[0-9](\.[0-9])?$')
        or (_checks.check_name = 'nota_maxima_indevida' and l.mensagem_abordagem_comercial ~* 'nota\s*m[áa]xima' and l.total_score ~ '^[0-9](\.[0-9])?$')
        or (_checks.check_name = 'avaliador_inexistente' and l.mensagem_abordagem_comercial ~* '(coment[áa]rio d[aeo]|review d[aeo]|avalia[çc][ãa]o d[aeo]|[oa])\s+[A-ZÁÂÃÉÊÍÓÔÕÚ][a-záâãéêíóôõúç]{2,15}\s+(fala|falou|escreveu|comentou|disse|destac|chamou|citou|elogi)')
        or (_checks.check_name = 'pixel_sem_analise' and l.mensagem_abordagem_comercial ~* 'n[ãa]o (tem|possui|encontrei|achei|identifiquei)[^\.]{0,30}pixel')
        or (_checks.check_name = 'nega_site_existente' and l.mensagem_abordagem_comercial ~* 'n[ãa]o (tem|possui)[^\.]{0,25}site')
        or (_checks.check_name = 'nega_instagram_existente' and l.mensagem_abordagem_comercial ~* 'n[ãa]o (tem|possui)[^\.]{0,25}instagram')
        or (_checks.check_name = 'avaliador_insatisfeito_citado'
            and l.mensagem_abordagem_comercial ~* '(coment[áa]rio d[aeo]|review d[aeo]|avalia[çc][ãa]o d[aeo]|[oa])\s+[A-ZÁÂÃÉÊÍÓÔÕÚ][a-záâãéêíóôõúç]{2,15}\s+(fala|falou|escreveu|comentou|disse|destac|chamou|citou|elogi)'
            and exists (
              select 1 from public.lead_comments c
              where c.lead_id = l.id
                and c.author_name ilike '%' || (regexp_match(l.mensagem_abordagem_comercial,
                  '(?:coment[áa]rio d[aeo]|review d[aeo]|avalia[çc][ãa]o d[aeo]|[oa])\s+([A-ZÁÂÃÉÊÍÓÔÕÚ][a-záâãéêíóôõúç]{2,15})\s+(?:fala|falou|escreveu|comentou|disse|destac|chamou|citou|elogi)'))[1] || '%'
            ))
        or (_checks.check_name = 'linguagem_garantia_indevida')
      );

    select count(*) into _universo_24h
    from public.leads l
    where l.mensagem_abordagem_comercial is not null
      and length(l.mensagem_abordagem_comercial) > 10
      and l.id::text not like 'd1e1%'
      and coalesce(l.company_name, '') !~* 'teste|test |exemplo|demo|lorem'
      and l.updated_at >= _captured_at - interval '24 hours'
      and (
        (_checks.check_name in ('reviews_superestimado') and l.mensagem_abordagem_comercial ~* '[0-9][0-9\.]{0,6}\s*(avalia[çc][õo]es|reviews)' and l.reviews_count ~ '^[0-9]+$')
        or (_checks.check_name = 'nota_superestimada' and l.mensagem_abordagem_comercial ~* 'nota\s*(?:de\s*)?[0-9]' and l.total_score ~ '^[0-9](\.[0-9])?$')
        or (_checks.check_name = 'nota_maxima_indevida' and l.mensagem_abordagem_comercial ~* 'nota\s*m[áa]xima' and l.total_score ~ '^[0-9](\.[0-9])?$')
        or (_checks.check_name = 'avaliador_inexistente' and l.mensagem_abordagem_comercial ~* '(coment[áa]rio d[aeo]|review d[aeo]|avalia[çc][ãa]o d[aeo]|[oa])\s+[A-ZÁÂÃÉÊÍÓÔÕÚ][a-záâãéêíóôõúç]{2,15}\s+(fala|falou|escreveu|comentou|disse|destac|chamou|citou|elogi)')
        or (_checks.check_name = 'pixel_sem_analise' and l.mensagem_abordagem_comercial ~* 'n[ãa]o (tem|possui|encontrei|achei|identifiquei)[^\.]{0,30}pixel')
        or (_checks.check_name = 'nega_site_existente' and l.mensagem_abordagem_comercial ~* 'n[ãa]o (tem|possui)[^\.]{0,25}site')
        or (_checks.check_name = 'nega_instagram_existente' and l.mensagem_abordagem_comercial ~* 'n[ãa]o (tem|possui)[^\.]{0,25}instagram')
        or (_checks.check_name = 'avaliador_insatisfeito_citado'
            and l.mensagem_abordagem_comercial ~* '(coment[áa]rio d[aeo]|review d[aeo]|avalia[çc][ãa]o d[aeo]|[oa])\s+[A-ZÁÂÃÉÊÍÓÔÕÚ][a-záâãéêíóôõúç]{2,15}\s+(fala|falou|escreveu|comentou|disse|destac|chamou|citou|elogi)'
            and exists (
              select 1 from public.lead_comments c
              where c.lead_id = l.id
                and c.author_name ilike '%' || (regexp_match(l.mensagem_abordagem_comercial,
                  '(?:coment[áa]rio d[aeo]|review d[aeo]|avalia[çc][ãa]o d[aeo]|[oa])\s+([A-ZÁÂÃÉÊÍÓÔÕÚ][a-záâãéêíóôõúç]{2,15})\s+(?:fala|falou|escreveu|comentou|disse|destac|chamou|citou|elogi)'))[1] || '%'
            ))
        or (_checks.check_name = 'linguagem_garantia_indevida')
      );

    insert into public.copy_quality_daily (
      captured_at, test_id, check_name, severity,
      universo_total, falhas_total, universo_24h, falhas_24h
    ) values (
      _captured_at, _checks.test_id, _checks.check_name, _checks.severity,
      _universo_total, _falhas_total, _universo_24h, _falhas_24h
    );
    _n := _n + 1;
  end loop;

  return _n;
end;
$$;

COMMENT ON FUNCTION private.capture_copy_quality_snapshot() IS
  'Cron-only: snapshot diário de grounding e risco de marca da copy fria (CP-T01..T04, CP-T10..T11).';

-- ----------------------------------------------------------------------------
-- Alerta: CP-T11 entra no tier "qualquer ocorrência nova dispara" (baseline
-- quase zero). CP-T10 fica de fora dessa lista de propósito — cai no ramo
-- else (tier crônico, taxa >2x a histórica), porque já tem backlog relevante
-- e alertar em toda ocorrência seria ruído do já conhecido.
-- ----------------------------------------------------------------------------

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

    if _row.check_name in ('nota_maxima_indevida', 'nega_site_existente', 'nega_instagram_existente', 'linguagem_garantia_indevida') then
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

COMMENT ON FUNCTION private.check_and_send_copy_quality_alert() IS
  'Cron-only: avalia o snapshot mais recente de copy_quality_daily e dispara e-mail (send-ops-alert) só em regressão real. Autentica com token compartilhado (vault: ops_alert_shared_token), não com JWT/service_role.';

-- ----------------------------------------------------------------------------
-- RPC admin: mesma lista de tier-1 replicada aqui (ver comentário original em
-- 20260811160000 — manter as duas em sincronia se o limiar mudar).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_admin_copy_quality()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
declare
  _result jsonb;
  _latest timestamptz;
begin
  if auth.uid() is null or not public.is_admin(auth.uid()) then
    raise exception using errcode = '42501', message = 'ADMIN_ONLY';
  end if;

  select max(captured_at) into _latest from public.copy_quality_daily;

  select jsonb_build_object(
    'last_captured_at', _latest,
    'schedule', (select schedule from cron.job where jobname = 'capture-copy-quality-daily'),
    'job_active', (select active from cron.job where jobname = 'capture-copy-quality-daily'),
    'last_run', (
      select jsonb_build_object('start_time', start_time, 'status', status)
      from cron.job_run_details
      where jobid = (select jobid from cron.job where jobname = 'capture-copy-quality-daily')
      order by start_time desc
      limit 1
    ),
    'last_alert_sent_at', (
      select max(created_at) from public.email_send_log
      where template_name = 'ops_copy_quality_alert' and status = 'sent'
    ),
    'checks', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'test_id', test_id,
            'check_name', check_name,
            'severity', severity,
            'universo_total', universo_total,
            'falhas_total', falhas_total,
            'taxa_total_pct', case when universo_total > 0
              then round(falhas_total::numeric / universo_total * 100, 1) else null end,
            'universo_24h', universo_24h,
            'falhas_24h', falhas_24h,
            'taxa_24h_pct', case when universo_24h > 0
              then round(falhas_24h::numeric / universo_24h * 100, 1) else null end,
            'is_regression', (
              case
                when severity = 'metrica' then false
                when check_name in ('nota_maxima_indevida', 'nega_site_existente', 'nega_instagram_existente', 'linguagem_garantia_indevida')
                  then falhas_24h > 0
                when universo_24h >= 5 and falhas_24h > 0 and universo_total > 0 then
                  (falhas_total::numeric / universo_total) = 0
                  or (falhas_24h::numeric / universo_24h) > 2 * (falhas_total::numeric / universo_total)
                else false
              end
            )
          )
          order by check_name
        ),
        '[]'::jsonb
      )
      from public.copy_quality_daily
      where captured_at = _latest
    )
  ) into _result;

  return _result;
end;
$$;

COMMENT ON FUNCTION public.get_admin_copy_quality() IS
  'Admin-only. Snapshot mais recente de copy_quality_daily (CP-T01..T04, CP-T10..T11) + status do cron (capture-copy-quality-daily) + último alerta enviado.';

-- Estabelece o ponto histórico com os 2 novos checks imediatamente; o cron
-- diário segue cobrindo os 9 a partir de agora.
select private.capture_copy_quality_snapshot();
