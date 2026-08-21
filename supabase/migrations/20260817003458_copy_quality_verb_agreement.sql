-- ============================================================================
-- CP-T03/T04: the "denies X" grounding checks only matched the singular verb
-- form ("tem"/"possui"), not the plural agreement Portuguese actually requires
-- when addressing a business as "vocês" ("têm"/"possuem"). Copy that reads
-- "vocês não têm site" — the grammatically correct, more natural phrasing an
-- LLM is more likely to produce — silently passed every check.
--
-- Found by porting these checks to an offline eval harness
-- (evals/copy-grounding/) and testing them against a synthetic fixture written
-- in natural Portuguese: the fixture failed against this view's regex before
-- it failed against anything else. See docs/eval-report.md.
--
-- No new checks, no schema change — only widens three existing regexes
-- (CREATE OR REPLACE, same shape as every prior copy_quality_* migration).
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
  -- Widened: "não têm"/"não possuem" (plural agreement with "vocês") in
  -- addition to "não tem"/"não possui".
  WHERE b.copy ~* 'n[ãa]o (tem|t[êe]m|possui|possuem|encontrei|achei|identifiquei)[^\.]{0,30}pixel'
    AND coalesce(b.website_analysis, '') = ''
),
t04_site AS (
  SELECT b.lead_id, b.user_id, 'CP-T04' AS test_id, 'nega_site_existente' AS check_name, 'gate' AS severity,
    jsonb_build_object('website', b.website) AS context
  FROM base b
  WHERE b.copy ~* 'n[ãa]o (tem|t[êe]m|possui|possuem)[^\.]{0,25}site'
    AND b.website IS NOT NULL AND b.website <> ''
),
t04_instagram AS (
  SELECT b.lead_id, b.user_id, 'CP-T04' AS test_id, 'nega_instagram_existente' AS check_name, 'gate' AS severity,
    jsonb_build_object('instagram', b.instagram) AS context
  FROM base b
  WHERE b.copy ~* 'n[ãa]o (tem|t[êe]m|possui|possuem)[^\.]{0,25}instagram'
    AND b.instagram IS NOT NULL AND b.instagram <> ''
),
t10_avaliador_insatisfeito AS (
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
  'Grounding e risco de marca da copy fria (CP-T01..T04, CP-T10..T11) — uma linha por violação encontrada. Admin-only via RLS invocada das tabelas base. CP-T03/T04 cobrem tem/têm e possui/possuem desde 20260816200000.';

REVOKE ALL ON public.ops_copy_quality FROM anon;

-- capture_copy_quality_snapshot()'s "universo" predicates mirror these same
-- regexes per check_name (see 20260811235840). Widen the same three there so
-- universo_total/universo_24h stay consistent with what ops_copy_quality now
-- actually flags.
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
        or (_checks.check_name = 'pixel_sem_analise' and l.mensagem_abordagem_comercial ~* 'n[ãa]o (tem|t[êe]m|possui|possuem|encontrei|achei|identifiquei)[^\.]{0,30}pixel')
        or (_checks.check_name = 'nega_site_existente' and l.mensagem_abordagem_comercial ~* 'n[ãa]o (tem|t[êe]m|possui|possuem)[^\.]{0,25}site')
        or (_checks.check_name = 'nega_instagram_existente' and l.mensagem_abordagem_comercial ~* 'n[ãa]o (tem|t[êe]m|possui|possuem)[^\.]{0,25}instagram')
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
        or (_checks.check_name = 'pixel_sem_analise' and l.mensagem_abordagem_comercial ~* 'n[ãa]o (tem|t[êe]m|possui|possuem|encontrei|achei|identifiquei)[^\.]{0,30}pixel')
        or (_checks.check_name = 'nega_site_existente' and l.mensagem_abordagem_comercial ~* 'n[ãa]o (tem|t[êe]m|possui|possuem)[^\.]{0,25}site')
        or (_checks.check_name = 'nega_instagram_existente' and l.mensagem_abordagem_comercial ~* 'n[ãa]o (tem|t[êe]m|possui|possuem)[^\.]{0,25}instagram')
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
  'Cron-only: snapshot diário de grounding e risco de marca da copy fria (CP-T01..T04, CP-T10..T11). CP-T03/T04 cobrem tem/têm e possui/possuem desde 20260816200000.';

-- Establish a fresh historical point under the corrected regexes now; the
-- daily cron continues from here.
select private.capture_copy_quality_snapshot();
