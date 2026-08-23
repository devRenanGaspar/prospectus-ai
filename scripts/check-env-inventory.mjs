#!/usr/bin/env node
// Checks docs/environment-variables.md against the actual Deno.env.get() call
// sites in supabase/functions/.
//
// That document opens by calling itself "an inventory of every secret this
// system reads, where it's read from, and why", audited "against the actual
// Deno.env.get() / Vault call sites, not against what any earlier doc
// claimed". It was true when written and drifted the same day the third audit
// ran: n8n-proxy started reading GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in
// get_calendar_access_token, and the table still attributed both to the two
// calendar functions alone. A reader rotating those credentials would have
// missed the function that most needed to know.
//
// A document that presents itself as a complete inventory either gets verified
// or stops presenting itself that way. This is the first option.
//
// The comparison is deliberately bidirectional. Checking only "every call site
// appears in the table" catches the drift above; checking only the other
// direction catches a row that outlived the code it described. Both are the
// same defect -- the document saying something the code does not -- and this
// repository has now produced one of each.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DOC = "docs/environment-variables.md";
const ROOT = "supabase/functions";
// The heading that owns the table. Anchoring to it, rather than to the first
// table in the file, keeps the client build-time table and the Vault table --
// neither of which is a Deno.env.get() call site -- out of the comparison.
const HEADING = "## Edge Function secrets (`Deno.env.get`)";

// Reads that live in _shared/ belong to whichever function imports the module,
// which this script does not resolve. There are none today; if one appears,
// it fails loudly here rather than being silently attributed to a directory
// that is not a function.
const SHARED = "_shared";
// _tests/ holds the Deno behavioral test suite (supabase/functions/_tests/),
// not a deployed function -- it sets env vars for handler.ts to read, it does
// not read them itself. Excluded the same way SHARED is, so the "every
// function" wildcard below does not expand into a directory the deploy CLI
// skips.
const NON_FUNCTION_DIRS = new Set([SHARED, "_tests"]);

/** Joins the two halves of a (function, variable) pair. Neither half contains it. */
const SEPARATOR = String.fromCharCode(9);

function sources(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sources(full, acc);
    else if (/\.tsx?$/.test(entry.name)) acc.push(full.split("\\").join("/"));
  }
  return acc;
}

/** Every (function, variable) pair the code actually reads. */
function fromCode() {
  const pairs = new Set();
  const shared = [];
  for (const file of sources(ROOT)) {
    const fn = file.slice(ROOT.length + 1).split("/")[0];
    const contents = readFileSync(file, "utf8");
    for (const match of contents.matchAll(/Deno\.env\.get\(\s*['"]([A-Z0-9_]+)['"]/g)) {
      if (fn === SHARED) shared.push(`${file}: ${match[1]}`);
      else if (!NON_FUNCTION_DIRS.has(fn)) pairs.add(`${fn}${SEPARATOR}${match[1]}`);
    }
  }
  return { pairs, shared };
}

/** Every (function, variable) pair the document claims. */
function fromDoc(functions) {
  const doc = readFileSync(DOC, "utf8");
  const start = doc.indexOf(HEADING);
  if (start === -1) {
    console.error(`${DOC} no longer contains the heading "${HEADING}".`);
    console.error(`Either restore it or delete this check -- an inventory nobody verifies is`);
    console.error(`worse than no inventory, because it still gets believed.`);
    process.exit(1);
  }
  const section = doc.slice(start, doc.indexOf("\n## ", start + 1));

  const pairs = new Set();
  let rows = 0;
  for (const line of section.split("\n")) {
    // | `VAR` | `fn-a`, `fn-b` | purpose |
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 4 || !cells[1].startsWith("`")) continue;
    const variable = cells[1].replace(/`/g, "").trim();
    if (!/^[A-Z0-9_]+$/.test(variable)) continue;
    rows += 1;

    // "every function" is the one wildcard the table uses, for SUPABASE_URL.
    // Expanding it here means the row stays true when a function is added --
    // and false, loudly, if a new function does not read it.
    const used = /every function/i.test(cells[2])
      ? functions
      : [...cells[2].matchAll(/`([a-z0-9-]+)`/g)].map((m) => m[1]);

    for (const fn of used) pairs.add(`${fn}${SEPARATOR}${variable}`);
  }

  // Guards the guard: a table that stopped parsing would produce an empty set,
  // and an empty set on both sides is a passing comparison that checked
  // nothing.
  const FLOOR = 8;
  if (rows < FLOOR) {
    console.error(`Only ${rows} variable rows parsed from ${DOC} -- expected at least ${FLOOR}.`);
    console.error(`The table format probably changed. Fix the parser rather than the floor.`);
    process.exit(1);
  }
  return pairs;
}

const functions = readdirSync(ROOT, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !NON_FUNCTION_DIRS.has(e.name))
  .map((e) => e.name);

const { pairs: code, shared } = fromCode();
const doc = fromDoc(functions);

const undocumented = [...code].filter((p) => !doc.has(p)).sort();
const stale = [...doc].filter((p) => !code.has(p)).sort();

let ok = true;

if (shared.length > 0) {
  console.error(`Deno.env.get() inside ${ROOT}/${SHARED}/, which this check cannot attribute to a function:`);
  for (const s of shared) console.error(`  ${s}`);
  console.error(`Move the read into the calling function, or teach this script to resolve imports.`);
  ok = false;
}

// A pair is `function<SEPARATOR>VARIABLE`, so it splits into exactly two
// halves. This used to print with a single-pattern `String.replace`, which
// CodeQL flagged as incomplete escaping -- rightly: that form rewrites only
// the first occurrence, so the code read as if it handled a case it did not.
// Splitting states what is actually true about the shape of the key.
function describe(pair) {
  const [fn, variable] = pair.split(SEPARATOR);
  return `  ${fn} reads ${variable}`;
}

if (undocumented.length > 0) {
  console.error(`Read by the code, absent from ${DOC}:`);
  for (const pair of undocumented) console.error(describe(pair));
  ok = false;
}

if (stale.length > 0) {
  console.error(`Claimed by ${DOC}, not read anywhere in the code:`);
  for (const pair of stale) console.error(describe(pair));
  ok = false;
}

if (!ok) {
  console.error(`${DOC} calls itself an inventory of every secret this system reads. Update it.`);
  process.exit(1);
}

console.log(`${DOC}: all ${code.size} (function, variable) pairs match the code.`);
