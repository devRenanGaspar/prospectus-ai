-- ============================================================================
-- Grounding da copy fria (Grupo A do gold set de qualidade) — GENERATE_COPY é
-- 58,4% dos créditos gastos e a única etapa do pipeline com verdade de
-- referência já no próprio banco (reviews_count, total_score, lead_comments,
-- website, instagram). Mesmo padrão de `ops_*` (M6) + snapshot diário no
-- mesmo molde de `system_health_snapshots`.
--
-- 4 checagens, todas SELECT puro sobre `leads`/`lead_comments`, sem PII nova:
--   CP-T01 · gate    · metadado do Google Business Profile inflado
--            (nº de avaliações, nota, "nota máxima" sem ser 5)
--   CP-T02 · métrica · avaliador citado pelo nome não existe em lead_comments
--            (heurística de regex — falso-positivo conhecido em
--            marca/plataforma citada perto de um verbo; por isso é métrica,
--            não gate, até refinar)
--   CP-T03 · gate    · afirma ausência de pixel do Meta sem website_analysis
--   CP-T04 · gate    · nega site/Instagram que existe na própria linha
--
-- R7 (seeds/demo em produção): excluídos por heurística até existir a coluna
-- `leads.is_seed`.
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
)
SELECT * FROM t01_reviews
UNION ALL SELECT * FROM t01_nota
UNION ALL SELECT * FROM t01_nota_maxima
UNION ALL SELECT * FROM t02_avaliador
UNION ALL SELECT * FROM t03_pixel
UNION ALL SELECT * FROM t04_site
UNION ALL SELECT * FROM t04_instagram;

COMMENT ON VIEW public.ops_copy_quality IS
  'Grounding da copy fria (CP-T01..T04) — uma linha por violação encontrada. Admin-only via RLS invocada das tabelas base.';

REVOKE ALL ON public.ops_copy_quality FROM anon;

-- ----------------------------------------------------------------------------
-- Snapshot diário — mesmo padrão de `system_health_snapshots`: tabela com RLS
-- admin-only, populada por função SECURITY DEFINER agendada via pg_cron.
-- Volume real de GENERATE_COPY (~20-50/dia nas semanas normais) é baixo o
-- bastante para granularidade diária ser suficiente; não há necessidade de
-- rollup horário aqui (7 linhas/dia, ~2.5k linhas/ano).
--
-- Caveat conhecido: não existe timestamp de geração de copy por lead
-- (usage_logs.lead_id não é populado para GENERATE_COPY). `universo_24h`/
-- `falhas_24h` usam leads.updated_at como proxy — impreciso se o lead for
-- atualizado por outro motivo no mesmo dia, mas é o único sinal disponível
-- sem o R5 (contexto de geração persistido).
-- ----------------------------------------------------------------------------

CREATE TABLE public.copy_quality_daily (
  id bigint generated always as identity primary key,
  captured_at timestamptz not null default now(),
  test_id text not null,
  check_name text not null,
  severity text not null check (severity in ('gate', 'metrica')),
  universo_total integer not null check (universo_total >= 0),
  falhas_total integer not null check (falhas_total >= 0),
  universo_24h integer not null check (universo_24h >= 0),
  falhas_24h integer not null check (falhas_24h >= 0)
);

CREATE INDEX copy_quality_daily_captured_at_idx
  ON public.copy_quality_daily (captured_at DESC);

ALTER TABLE public.copy_quality_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read copy quality history"
  ON public.copy_quality_daily FOR SELECT TO authenticated
  USING (public.is_admin((SELECT auth.uid())));

REVOKE ALL ON TABLE public.copy_quality_daily FROM public, anon, authenticated;
GRANT SELECT ON TABLE public.copy_quality_daily TO authenticated;
GRANT SELECT, INSERT ON TABLE public.copy_quality_daily TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.copy_quality_daily_id_seq TO service_role;

COMMENT ON TABLE public.copy_quality_daily IS
  'Snapshot diário de grounding da copy fria (ops_copy_quality agregado). PII-free — só contadores.';

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
      ('CP-T04','nega_instagram_existente','gate')
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
    -- (ex.: T03 só considera copies que mencionam pixel) — reaproveita a mesma
    -- condição WHERE das CTEs da view via o predicado inline abaixo.
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

REVOKE ALL ON FUNCTION private.capture_copy_quality_snapshot() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.capture_copy_quality_snapshot() TO postgres;

COMMENT ON FUNCTION private.capture_copy_quality_snapshot() IS
  'Cron-only: snapshot diário de grounding da copy fria (CP-T01..T04).';

DO $$
declare
  _job_id bigint;
begin
  select jobid into _job_id from cron.job where jobname = 'capture-copy-quality-daily';
  if _job_id is not null then
    perform cron.unschedule(_job_id);
  end if;

  -- 06:00 UTC = 03:00 America/Sao_Paulo — fora do horário comercial do produto.
  perform cron.schedule(
    'capture-copy-quality-daily',
    '0 6 * * *',
    $job$select private.capture_copy_quality_snapshot();$job$
  );
end;
$$;

-- Estabelece o primeiro ponto histórico imediatamente; o cron segue 1x/dia.
select private.capture_copy_quality_snapshot();
