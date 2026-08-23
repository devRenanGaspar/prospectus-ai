import { describe, expect, it } from "vitest";
// Plain JS modules, not part of the app bundle. See
// evals/copy-grounding/checks.mjs for why this lives outside src/lib.
import { CHECKS, evaluateCopy } from "../../evals/copy-grounding/checks.mjs";
import { FIXTURES } from "../../evals/copy-grounding/fixtures.mjs";

describe("copy grounding checks (offline port of ops_copy_quality)", () => {
  it("ports all 9 CP-T checks", () => {
    expect(CHECKS.map((c) => c.check_name)).toEqual([
      "reviews_superestimado",
      "nota_superestimada",
      "nota_maxima_indevida",
      "avaliador_inexistente",
      "pixel_sem_analise",
      "nega_site_existente",
      "nega_instagram_existente",
      "avaliador_insatisfeito_citado",
      "linguagem_garantia_indevida",
    ]);
  });

  // The ad-hoc casts these lines used to carry are gone: the modules now ship
  // `.d.mts` declarations, so `fixture.lead` is a CopyLead instead of unknown.
  for (const fixture of FIXTURES) {
    it(`${fixture.id}: ${fixture.label}`, () => {
      const found = evaluateCopy(fixture.lead).map((v) => v.check_name);
      expect(found.sort()).toEqual([...fixture.expect].sort());
    });
  }
});
