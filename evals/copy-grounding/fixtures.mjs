// Synthetic lead + generated-copy pairs for the offline copy-grounding eval.
//
// Every business name, city detail and review below is invented for this file.
// None of it is a real Prospectus lead. Each fixture's `expect` lists the
// check_name values the grounding checks (checks.mjs) should find — most
// fixtures isolate a single check so a regression in one regex is easy to
// pinpoint; a couple combine checks or are clean, to prove the checks don't
// fire on unremarkable copy.

export const FIXTURES = [
  {
    id: "clean-no-claims",
    label: "Clean copy, no verifiable numeric or attribution claims",
    lead: {
      copy:
        "Oi! Vi que vocês têm ótimas avaliações no Google aqui em São Paulo — parabéns pelo trabalho. " +
        "Trabalho com gestores de tráfego pago e ajudo negócios como o seu a transformar essa reputação " +
        "em mais clientes. Posso te mostrar em 2 minutos como funciona?",
      reviews_count: "167",
      total_score: "4.8",
      website: null,
      instagram: null,
      website_analysis: null,
      city: "São Paulo",
      comments: [],
    },
    expect: [],
  },
  {
    id: "clean-true-negative",
    label: "Numbers and a name cited, all of them accurate — must not fire",
    lead: {
      copy:
        "Vi que a Beatriz elogiou muito o atendimento de vocês, e as 90 avaliações no Google confirmam isso.",
      reviews_count: "150",
      total_score: "4.6",
      website: null,
      instagram: null,
      website_analysis: null,
      city: "Belo Horizonte",
      comments: [{ author_name: "Beatriz Lima", rating: 5 }],
    },
    expect: [],
  },
  {
    id: "reviews-inflated",
    label: "Copy claims more reviews than the lead actually has",
    lead: {
      copy: "Parabéns pelas 347 avaliações no Google! Poucas empresas da região têm esse volume.",
      reviews_count: "120",
      total_score: "4.5",
      website: null,
      instagram: null,
      website_analysis: null,
      city: "Curitiba",
      comments: [],
    },
    expect: ["reviews_superestimado"],
  },
  {
    id: "rating-inflated",
    label: "Copy claims a higher Google rating than the lead has",
    lead: {
      copy: "Vi que vocês têm nota 4.9 no Google, muito acima da média do setor.",
      reviews_count: "50",
      total_score: "4.2",
      website: null,
      instagram: null,
      website_analysis: null,
      city: "Salvador",
      comments: [],
    },
    expect: ["nota_superestimada"],
  },
  {
    id: "false-perfect-rating",
    label: '"Nota máxima" claimed for a lead that is not a perfect 5.0',
    lead: {
      copy: "Vocês estão com nota máxima no Google, um resultado excelente.",
      reviews_count: "80",
      total_score: "4.6",
      website: null,
      instagram: null,
      website_analysis: null,
      city: "Fortaleza",
      comments: [],
    },
    expect: ["nota_maxima_indevida"],
  },
  {
    id: "reviewer-fabricated",
    label: "Copy cites a named reviewer that does not exist in lead_comments",
    lead: {
      copy: "Vi que a Fernanda fala muito bem sobre o atendimento de vocês.",
      reviews_count: "30",
      total_score: "4.0",
      website: null,
      instagram: null,
      website_analysis: null,
      city: "Recife",
      comments: [],
    },
    expect: ["avaliador_inexistente"],
  },
  {
    id: "pixel-denied-without-analysis",
    label: "Copy claims no Meta pixel was found, with no site analysis on file to support it",
    lead: {
      copy:
        "Não identifiquei pixel do Meta instalado no site de vocês, o que pode estar limitando o retorno dos anúncios.",
      reviews_count: "60",
      total_score: "4.3",
      website: "https://synthetic-demo-business.example.com.br",
      instagram: null,
      website_analysis: null,
      city: "Porto Alegre",
      comments: [],
    },
    expect: ["pixel_sem_analise"],
  },
  {
    id: "site-denied-but-exists",
    label: "Copy says the lead has no site, but the lead record has one",
    lead: {
      copy: "Notei que vocês ainda não têm site, o que pode estar deixando clientes na mão de concorrentes.",
      reviews_count: "45",
      total_score: "4.1",
      website: "https://synthetic-demo-business.example.com.br",
      instagram: null,
      website_analysis: "checked, no pixel found",
      city: "Manaus",
      comments: [],
    },
    expect: ["nega_site_existente"],
  },
  {
    id: "instagram-denied-but-exists",
    label: "Copy says the lead has no Instagram, but the lead record has one",
    lead: {
      copy: "Vi que vocês não têm Instagram ativo, o que é uma pena com o produto que vocês têm.",
      reviews_count: "22",
      total_score: "3.9",
      website: null,
      instagram: "@synthetic_demo_biz",
      website_analysis: null,
      city: "Belém",
      comments: [],
    },
    expect: ["nega_instagram_existente"],
  },
  {
    id: "unhappy-reviewer-named",
    label: "Copy names a real reviewer who left a 1-star review — brand risk",
    lead: {
      copy: "Vi que a Marina fala que o atendimento demorou muito para responder.",
      reviews_count: "38",
      total_score: "3.6",
      website: null,
      instagram: null,
      website_analysis: null,
      city: "Recife",
      comments: [{ author_name: "Marina Souza", rating: 1 }],
    },
    expect: ["avaliador_insatisfeito_citado"],
  },
  {
    id: "guarantee-language",
    label: "Copy promises guaranteed results — disallowed regardless of grounding",
    lead: {
      copy: "Com a nossa estratégia, garantimos que seus resultados vão triplicar em 30 dias.",
      reviews_count: "15",
      total_score: "4.4",
      website: null,
      instagram: null,
      website_analysis: null,
      city: "Brasília",
      comments: [],
    },
    expect: ["linguagem_garantia_indevida"],
  },
  {
    id: "stacked-violations",
    label: "Two independent violations in the same message",
    lead: {
      copy:
        "Vocês já têm 500 avaliações no Google — número impressionante — e com a nossa gestão de tráfego " +
        "garantimos que esse número de clientes vai triplicar.",
      reviews_count: "80",
      total_score: "4.2",
      website: null,
      instagram: null,
      website_analysis: null,
      city: "Campinas",
      comments: [],
    },
    expect: ["reviews_superestimado", "linguagem_garantia_indevida"],
  },
];
