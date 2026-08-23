#!/usr/bin/env node
// Type-checks supabase/functions/ with `deno check`.
//
// `npm run typecheck` runs tsc over tsconfig.app.json (include: ["src"]) and
// tsconfig.node.json (vite.config.ts). Neither covers supabase/functions/ --
// so until this script existed, twelve edge functions holding every
// privileged path in the system were the only TypeScript in the repository
// that nothing type-checked. The comment above the deploy job in ci.yml said
// otherwise, which is the part that made it worth fixing: an unchecked
// directory is a gap, an unchecked directory the repository claims is checked
// is a false statement about itself.
//
// Why `deno check` and not another tsconfig: the functions import from
// https://esm.sh/... and npm:..., and call Deno.env. Teaching tsc to resolve
// those needs shims that describe the runtime a second time, and a second
// description drifts from the first. `deno check` is the same type-checker
// the functions actually run under.
//
// Deno resolves configuration by searching the current directory and its
// ancestors -- never its descendants. Running from the repository root without
// --config would silently ignore deno.check.json and fail on the npm:
// specifiers, so the flag is not optional.
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = "supabase/functions";
const CONFIG = "deno.check.json";

// Every .ts/.tsx under supabase/functions/, not just the index.ts entrypoints.
// Checking entrypoints alone would follow imports and cover the same files in
// practice, but it would stop covering a module the moment its last importer
// went away -- and an orphaned module that no longer compiles is exactly the
// kind of thing that gets re-imported later by someone who assumes it works.
function sources(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sources(full, acc);
    else if (/\.tsx?$/.test(entry.name)) acc.push(full.split("\\").join("/"));
  }
  return acc;
}

const files = sources(ROOT);

// Guards the guard. `deno check` with an empty file list exits 0 and prints
// nothing -- so a glob that stopped matching, or a directory that moved, would
// turn this into a step that passes without checking anything. The floor is
// deliberately well below the current count (24) and well above zero.
const FLOOR = 12;
if (files.length < FLOOR) {
  console.error(`Only ${files.length} source files found under ${ROOT}/ -- expected at least ${FLOOR}.`);
  console.error(`Either the directory moved or this script stopped finding it. A type-check`);
  console.error(`that checks nothing passes, which is worse than not having one.`);
  process.exit(1);
}

// `deno` on PATH when the developer has it; otherwise npx fetches the pinned
// version. CI installs it with denoland/setup-deno, so the fallback is for
// local runs of `npm run check`.
//
// Availability is probed rather than inferred from a failed run: a failed run
// cannot tell "deno is not installed" apart from "deno found a type error",
// so retrying under npx on failure would re-run the whole check every time it
// caught a genuine error, and report it twice.
//
// A real `deno` binary is spawned directly. The npx fallback cannot be: npx is
// a .cmd on Windows, and since CVE-2024-27980 Node refuses to spawn .cmd/.bat
// without a shell. A shell concatenates arguments instead of escaping them,
// which is fine for these paths and stops being fine the first time one holds
// a space -- so the fallback asserts that rather than assuming it. CI installs
// a real deno and never reaches this path.
const PINNED = "deno@2.9.5";

function available() {
  try {
    execFileSync("deno", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const direct = available();
if (!direct) console.log(`(deno not on PATH -- using npx ${PINNED})`);

const args = ["check", "--config", CONFIG, ...files];
if (!direct) {
  const unsafe = args.filter((a) => /\s|["'&|<>^]/.test(a));
  if (unsafe.length > 0) {
    console.error(`Cannot run the npx fallback: these arguments would need shell quoting:`);
    for (const a of unsafe) console.error(`  ${a}`);
    console.error(`Install Deno (https://deno.land) and re-run -- that path spawns without a shell.`);
    process.exit(1);
  }
}

console.log(`deno check: ${files.length} files under ${ROOT}/`);
try {
  if (direct) {
    execFileSync("deno", args, { stdio: "inherit" });
  } else {
    execFileSync("npx", ["--yes", PINNED, ...args], { stdio: "inherit", shell: true });
  }
} catch (error) {
  process.exit(error.status ?? 1);
}
console.log(`${ROOT}/: ${files.length} files type-check clean.`);
