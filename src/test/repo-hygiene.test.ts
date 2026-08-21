/**
 * Gates for the class this repository has reopened more than once: the
 * repository describing something about itself that is not true. Two
 * unrelated shapes of that defect, both found by reading the repo as a
 * stranger would rather than as its own author:
 *
 * 1. A markdown table row with no header/delimiter above it. GitHub renders
 *    it as a literal line of pipe-separated text, not a table cell -- found
 *    in docs/security-risk-register.md, where blank lines split one table
 *    into an unreadable one.
 * 2. Narration of the multi-cycle review process itself (`MAJOR 4`, `PR #63`,
 *    `Original finding:`) left in shipped code and docs. The design
 *    rationale a comment carries is worth keeping; which numbered review
 *    cycle produced it is not -- it points at documents this public
 *    repository does not contain (plano-revisor-*.md is gitignored), and it
 *    reads as a log of a process rather than a description of the system.
 *
 * Both are cheap to prevent and expensive to notice by reading -- exactly the
 * kind of thing a static gate is for.
 */
import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

function trackedFiles(pattern: string): string[] {
  return execSync(`git ls-files -- "${pattern}"`, { encoding: "utf8" })
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);
}

describe("every markdown table row has a header and delimiter above it", () => {
  const files = trackedFiles("*.md");

  it("finds markdown files to check", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("has no orphan table row in any tracked markdown file", () => {
    const orphans: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, "utf8").split(/\r?\n/);
      let inTable = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const isRow = /^\s*\|.*\|\s*$/.test(line);
        const next = lines[i + 1] ?? "";
        if (isRow && !inTable) {
          if (/^\s*\|[\s:|-]+\|\s*$/.test(next)) {
            inTable = true;
          } else {
            orphans.push(`${file}:${i + 1}  ${line.trim().slice(0, 80)}`);
          }
        } else if (inTable && !isRow) {
          inTable = false;
        }
      }
    }
    expect(orphans).toEqual([]);
  });
});

describe("no review-cycle narration in tracked files", () => {
  // Design rationale ("the audit row is written before the action because...")
  // is not narration and is not matched here. What is matched: labels that
  // point at the multi-cycle review process rather than at the system --
  // `MAJOR 4`, `BLOCKER 2`, `3rd audit cycle`, `Original finding:`, a PR
  // number, or a sentence keyed to when something changed relative to that
  // process rather than what it does now.
  const PATTERNS = [
    /\bMAJOR\s+\d+\b/,
    /\bBLOCKER\s+\d+\b/,
    /\baudit cycle\b/i,
    /ciclo de auditoria/i,
    /\bOriginal finding:/,
    /\bPRs?\s+#\d+\b/,
  ];

  // This file names its own subject in prose -- "MAJOR 4", "PR #63" -- which
  // would otherwise flag itself.
  const SELF = "src/test/repo-hygiene.test.ts";

  // Applied SQL statements are immutable (docs/database-change-checklist.md);
  // their comments may still be edited when a diff of statements alone
  // proves nothing executable changed, which is a repo-wide policy, not a
  // per-file allowance. Migrations are the one place a *date* in prose is
  // structural (the filename timestamp), not narration, so they are exempt
  // from this specific scan rather than requiring every historical comment
  // rewritten under the immutability rule above.
  const EXEMPT_DIRS = ["supabase/migrations/"];

  const files = [
    ...trackedFiles("*.ts"),
    ...trackedFiles("*.tsx"),
    ...trackedFiles("*.sql"),
    ...trackedFiles("*.md"),
    ...trackedFiles("*.yml"),
    ...trackedFiles("*.mjs"),
  ].filter((f) => f !== SELF && !EXEMPT_DIRS.some((dir) => f.startsWith(dir)));

  it("finds files to check", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("has no review-cycle narration outside migrations", () => {
    const hits: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, "utf8").split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        for (const pattern of PATTERNS) {
          if (pattern.test(lines[i])) {
            hits.push(`${file}:${i + 1}  ${lines[i].trim().slice(0, 100)}`);
            break;
          }
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
