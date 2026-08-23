#!/usr/bin/env node
// Runs the offline copy-grounding checks against evals/copy-grounding/fixtures.mjs
// and prints a human-readable report. This is the seed offline eval set for the
// copy-generation LLM stage — see docs/eval-report.md for what it does and does
// not cover.
//
// Usage: npm run eval

import { CHECKS, evaluateCopy } from "./checks.mjs";
import { FIXTURES } from "./fixtures.mjs";

function setsEqual(a, b) {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

let allPassed = true;

console.log(`Copy grounding eval — ${FIXTURES.length} fixtures, ${CHECKS.length} checks\n`);

for (const fixture of FIXTURES) {
  const violations = evaluateCopy(fixture.lead);
  const found = violations.map((v) => v.check_name);
  const ok = setsEqual(found, fixture.expect);
  allPassed = allPassed && ok;

  console.log(`${ok ? "PASS" : "FAIL"}  ${fixture.id}`);
  console.log(`      ${fixture.label}`);
  console.log(`      expected: [${fixture.expect.join(", ") || "none"}]`);
  console.log(`      found:    [${found.join(", ") || "none"}]`);
  if (!ok) {
    for (const v of violations) {
      console.log(`      context — ${v.check_name}: ${JSON.stringify(v.context)}`);
    }
  }
  console.log("");
}

const passCount = FIXTURES.filter((f) => setsEqual(evaluateCopy(f.lead).map((v) => v.check_name), f.expect)).length;
console.log(`${passCount}/${FIXTURES.length} fixtures matched their expected violations.`);

if (!allPassed) {
  console.error("\nOne or more fixtures did not match expectations — see FAIL lines above.");
  process.exit(1);
}
