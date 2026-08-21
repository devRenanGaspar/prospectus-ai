/**
 * The *syntactic* half of the gate for "a control that does nothing".
 *
 * The honest scope is narrower than "the control works": reading the text can establish that a handler
 * is **empty** or absent, and nothing beyond that. That is what is asserted
 * here. Whether a non-empty handler actually persists anything is a question
 * about behaviour, and it is answered by firing the control — see
 * `consent-switch-persists.test.tsx`, which is where the class is really
 * closed.
 *
 * One rule was considered and rejected: "fail any handler that only calls
 * setState". Verified against this repository, it would fail two correct
 * controls — `OnboardingModal.tsx`, whose Checkbox writes in `handleClose`,
 * and `AdminPlans.tsx`, whose Switch writes in `handleSave`. The exception
 * list that would follow is how the next genuinely inert control gets
 * through. A different heuristic, the same defect.
 *
 * `src/components/ui/` is excluded on purpose: those are the unstyled Radix
 * primitives, whose whole job is to receive a handler from a caller.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const SRC = resolve(__dirname, "..");

function tsxFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "ui" && entry.name !== "test") tsxFiles(full, acc);
    } else if (entry.name.endsWith(".tsx")) {
      acc.push(full);
    }
  }
  return acc;
}

/** `<Switch ... />` / `<Checkbox ... />`, self-closing, attributes included. */
const CONTROL = /<(Switch|Checkbox)\b[\s\S]{0,600}?\/>/g;

/**
 * A handler that provably does nothing: `() => {}`, `()=>{}`, `{undefined}`,
 * `{null}`. Whitespace and a parameter are allowed. A body with any statement
 * in it does not match, because this file makes no claim about what that
 * statement does.
 */
const EMPTY_HANDLER =
  /on(?:CheckedChange|Click)=\{\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*\{\s*\}\s*\}|on(?:CheckedChange|Click)=\{\s*(?:undefined|null)\s*\}/;

describe("no inert toggle controls", () => {
  const files = tsxFiles(SRC);

  it("finds the controls it is supposed to be checking", () => {
    // Guards the guard: a regex that matches nothing would pass this suite
    // silently and the class would reopen unnoticed.
    const total = files.reduce(
      (n, f) => n + [...readFileSync(f, "utf8").matchAll(CONTROL)].length,
      0,
    );
    expect(total).toBeGreaterThan(5);
  });

  it("recognises an empty handler when it sees one", () => {
    // The same guard, for the new half. The assertion below passes vacuously
    // if this regex stops matching — which is exactly how the previous version
    // of this file stayed green over a gate that checked nothing.
    for (const sample of [
      "onCheckedChange={() => {}}",
      "onCheckedChange={()=>{}}",
      "onCheckedChange={ (next) => {  } }",
      "onCheckedChange={undefined}",
      "onClick={() => {}}",
    ]) {
      expect(EMPTY_HANDLER.test(sample), sample).toBe(true);
    }

    for (const sample of [
      "onCheckedChange={(next) => saveConsent(consent.id, next)}",
      "onCheckedChange={setDontShowAgain}",
      "onClick={() => toggle(id)}",
    ]) {
      expect(EMPTY_HANDLER.test(sample), sample).toBe(false);
    }
  });

  it("every Switch and Checkbox outside ui/ has a handler, and it is not empty", () => {
    const inert: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(CONTROL)) {
        const before = source.slice(Math.max(0, match.index - 300), match.index);

        // A control can be driven by a handler on a wrapping element instead
        // of its own prop -- LeadCard does this, with an onClick on the div
        // around the Checkbox. Accept that, but only when the wrapper is
        // right there: the point is that *something* reacts to the click.
        const own = /onCheckedChange/.test(match[0]) && !EMPTY_HANDLER.test(match[0]);
        const wrapped = /onClick=/.test(before) && !EMPTY_HANDLER.test(before);
        if (own || wrapped) continue;

        const line = source.slice(0, match.index).split("\n").length;
        inert.push(
          `${relative(SRC, file).split("\\").join("/")}:${line} — ${match[0]
            .replace(/\s+/g, " ")
            .slice(0, 80)}`,
        );
      }
    }

    expect(inert).toEqual([]);
  });
});

describe("public assets referenced by absolute src=\"/...\" paths exist", () => {
  // An absolute src pointing at a public/ file that doesn't exist fails
  // silently in this app: the SPA's own catch-all serves index.html at any
  // unmatched path with a 200, so an <img> loads text/html instead of an
  // image, and an onError fallback (if one exists) hides the mismatch rather
  // than surfacing it. Nothing about that failure mode logs or throws.
  const SRC_DIR = resolve(__dirname, "..");
  const PUBLIC_DIR = resolve(__dirname, "../../public");

  it("every absolute src=\"/...\" reference in src/ has a matching file in public/", () => {
    const files = readdirSync(SRC_DIR, { recursive: true })
      .filter((f): f is string => typeof f === "string" && /\.(tsx?|jsx?)$/.test(f));

    const missing: string[] = [];
    for (const file of files) {
      const contents = readFileSync(resolve(SRC_DIR, file), "utf8");
      for (const match of contents.matchAll(/src=(?:"|\{")\/(?!\/)([^"{}\s]+)/g)) {
        const assetPath = resolve(PUBLIC_DIR, match[1]);
        if (!existsSync(assetPath)) {
          missing.push(`${file}: /${match[1]}`);
        }
      }
    }

    expect(missing).toEqual([]);
  });
});
