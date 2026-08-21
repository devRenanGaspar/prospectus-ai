#!/usr/bin/env node
/**
 * Fails when a production dependency is declared and never imported.
 *
 * This exists because removing the orphans once does not keep them away. The
 * project was scaffolded from a shadcn/ui template that installs a Radix
 * package per component; deleting the unused components left 14 dependencies
 * behind, shipped in `dependencies`, importing nothing. A reader who opens
 * package.json to see what the app is built on reads a list where a quarter of
 * it is noise.
 *
 * Scope is deliberately narrow -- production dependencies only. devDependencies
 * are tooling and are frequently used through config files, binaries and
 * plugins in ways a grep cannot see, so flagging them would produce false
 * positives and get the whole check ignored.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const deps = Object.keys(pkg.dependencies ?? {});

// git ls-files rather than a directory walk: it respects .gitignore, so
// node_modules and build output cannot accidentally count as usage.
const tracked = execSync("git ls-files", { cwd: root, encoding: "utf8" })
  .split("\n")
  .filter((f) => /\.(ts|tsx|js|jsx|mjs|cjs|html|css)$/.test(f));

const source = tracked
  .map((f) => {
    try {
      return readFileSync(resolve(root, f), "utf8");
    } catch {
      return "";
    }
  })
  .join("\n");

const escape = (s) => s.replace(/[/\\^$*+?.()|[\]{}]/g, "\\$&");

const orphans = deps.filter((dep) => {
  const d = escape(dep);
  // `from "pkg"`, `from "pkg/sub"`, `require("pkg")`, or a bare "pkg" string
  // (CSS imports and a few config shapes use the last form).
  return !new RegExp(
    `(from\\s+["']${d}(["'/])|require\\(["']${d}|["']${d}["'])`,
  ).test(source);
});

if (orphans.length > 0) {
  console.error(
    `${orphans.length} production ${
      orphans.length === 1 ? "dependency is" : "dependencies are"
    } declared and never imported:\n`,
  );
  for (const o of orphans) console.error(`  ${o}`);
  console.error(
    "\nRemove them with `npm uninstall`, or move them to devDependencies if\n" +
      "they are build tooling. If one is genuinely used in a way this check\n" +
      "cannot see, say so here rather than deleting the check.",
  );
  process.exit(1);
}

console.log(`${deps.length} production dependencies, all imported.`);
