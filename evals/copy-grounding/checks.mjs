// Offline JS port of the copy-quality grounding checks (CP-T01..T04, CP-T10..T11)
// defined in supabase/migrations/20260811130000_copy_quality_grounding.sql and
// supabase/migrations/20260811235840_copy_quality_group_b.sql.
//
// The SQL views are the source of truth for production (they run against real
// leads via pg_cron). This module exists so the same checks can be exercised
// offline, without a database, against synthetic fixtures — see fixtures.mjs
// and ../../docs/eval-report.md.
//
// Every regex and comparison below is copied from the SQL as closely as JS
// allows. Where Postgres and JS diverge (e.g. `replace()` replacing every
// occurrence vs JS's single-match default), the JS is written to match
// Postgres's behaviour, not JS's default.

const NAME_EXTRACTOR =
  /(?:coment[áa]rio d[aeo]|review d[aeo]|avalia[çc][ãa]o d[aeo]|[oa])\s+([A-ZÁÂÃÉÊÍÓÔÕÚ][a-záâãéêíóôõúç]{2,15})\s+(?:fala|falou|escreveu|comentou|disse|destac|chamou|citou|elogi)/i;

const PLATFORM_BLOCKLIST = new Set([
  "Google",
  "Instagram",
  "Facebook",
  "WhatsApp",
  "Meta",
  "News",
  "Youtube",
  "Yelp",
]);

function extractReviewerName(copy, city) {
  const match = copy.match(NAME_EXTRACTOR);
  if (!match) return null;
  const nome = match[1];
  if (PLATFORM_BLOCKLIST.has(nome)) return null;
  // SQL: position(nome IN city) > 0 — case-sensitive substring, e.g. "Grande"
  // captured out of "Campina Grande".
  if (city && city.includes(nome)) return null;
  return nome;
}

function findMatchingComment(comments, nome) {
  const needle = nome.toLowerCase();
  return (comments ?? []).find((c) => c.author_name?.toLowerCase().includes(needle)) ?? null;
}

export const CHECKS = [
  {
    test_id: "CP-T01",
    check_name: "reviews_superestimado",
    severity: "gate",
    run(lead) {
      const match = lead.copy.match(/([0-9][0-9.]{0,6})\s*(avalia[çc][õo]es|reviews)/i);
      if (!match) return null;
      if (!/^[0-9]+$/.test(lead.reviews_count ?? "")) return null;
      const citado = Number(match[1].replace(/\./g, ""));
      const real = Number(lead.reviews_count);
      return citado > real ? { citado, real } : null;
    },
  },
  {
    test_id: "CP-T01",
    check_name: "nota_superestimada",
    severity: "gate",
    run(lead) {
      const match = lead.copy.match(/nota\s*(?:de\s*)?([0-9](?:[,.][0-9])?)/i);
      if (!match) return null;
      if (!/^[0-9](\.[0-9])?$/.test(lead.total_score ?? "")) return null;
      const citado = Number(match[1].replace(/,/g, "."));
      const real = Number(lead.total_score);
      return citado > real ? { citado, real } : null;
    },
  },
  {
    test_id: "CP-T01",
    check_name: "nota_maxima_indevida",
    severity: "gate",
    run(lead) {
      if (!/nota\s*m[áa]xima/i.test(lead.copy)) return null;
      if (!/^[0-9](\.[0-9])?$/.test(lead.total_score ?? "")) return null;
      const real = Number(lead.total_score);
      return real < 5 ? { real } : null;
    },
  },
  {
    test_id: "CP-T02",
    check_name: "avaliador_inexistente",
    severity: "metrica",
    run(lead) {
      const nome = extractReviewerName(lead.copy, lead.city);
      if (!nome) return null;
      return findMatchingComment(lead.comments, nome) ? null : { nome_citado: nome };
    },
  },
  {
    test_id: "CP-T03",
    check_name: "pixel_sem_analise",
    severity: "gate",
    run(lead) {
      // Widened 2026-08-16 to also match "têm"/"possuem" (plural agreement
      // with "vocês") — the singular-only version missed grammatically
      // correct copy. See docs/eval-report.md.
      if (!/n[ãa]o (tem|t[êe]m|possui|possuem|encontrei|achei|identifiquei)[^.]{0,30}pixel/i.test(lead.copy)) return null;
      return lead.website_analysis ? null : {};
    },
  },
  {
    test_id: "CP-T04",
    check_name: "nega_site_existente",
    severity: "gate",
    run(lead) {
      if (!/n[ãa]o (tem|t[êe]m|possui|possuem)[^.]{0,25}site/i.test(lead.copy)) return null;
      return lead.website ? { website: lead.website } : null;
    },
  },
  {
    test_id: "CP-T04",
    check_name: "nega_instagram_existente",
    severity: "gate",
    run(lead) {
      if (!/n[ãa]o (tem|t[êe]m|possui|possuem)[^.]{0,25}instagram/i.test(lead.copy)) return null;
      return lead.instagram ? { instagram: lead.instagram } : null;
    },
  },
  {
    test_id: "CP-T10",
    check_name: "avaliador_insatisfeito_citado",
    severity: "gate",
    run(lead) {
      const nome = extractReviewerName(lead.copy, lead.city);
      if (!nome) return null;
      const comment = findMatchingComment(lead.comments, nome);
      if (!comment || comment.rating > 2) return null;
      return { nome_citado: nome, rating: comment.rating };
    },
  },
  {
    test_id: "CP-T11",
    check_name: "linguagem_garantia_indevida",
    severity: "gate",
    run(lead) {
      const hit = /(garantimos|garantido|garantia de resultado|prometo|promessa de resultado|triplicar|100%|com certeza vai)/i.test(
        lead.copy,
      );
      return hit ? {} : null;
    },
  },
];

/**
 * @param {{copy: string, reviews_count?: string|null, total_score?: string|null,
 *   website?: string|null, instagram?: string|null, website_analysis?: string|null,
 *   city?: string|null, comments?: {author_name: string, rating: number}[]}} lead
 * @returns {{test_id: string, check_name: string, severity: "gate"|"metrica", context: object}[]}
 */
export function evaluateCopy(lead) {
  return CHECKS.map((check) => {
    const context = check.run(lead);
    return context ? { test_id: check.test_id, check_name: check.check_name, severity: check.severity, context } : null;
  }).filter(Boolean);
}
