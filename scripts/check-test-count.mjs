#!/usr/bin/env node
// The README states how many tests run in CI, more than once, in different
// phrasings ("N tests run in CI" in prose, "Automated tests | N" in the
// stats table). Checking one phrasing closes that instance and not the
// class -- the second claim can drift the moment the first is fixed, silently,
// since nothing was reading it. This checks every place in the file that
// states a test count, however it's phrased, so a new claim added later is
// covered without anyone remembering to extend a regex.
//
// `vitest list` only collects -- it does not run the suite -- so this costs
// a few seconds and cannot be satisfied by editing prose alone. The Deno
// suite under supabase/functions/_tests/ has no equivalent dry-run listing,
// so that count comes from actually running it (check-functions-tests.mjs
// already runs in the same `npm run check`, so this is not extra cost on
// top of what CI does anyway).
import { execSync, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const README = "README.md";
// Matches "142 tests", "142 automated tests", and "Automated tests | 142" --
// the two phrasings found in this file so far -- without being so broad it
// catches unrelated numbers. Extend this if a new phrasing is introduced.
const CLAIMS = /(\d+)\s*(?:automated\s+)?tests?\b|Automated tests\s*\|\s*(\d+)/gi;

const raw = execSync("npx vitest list --json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
const vitestCount = JSON.parse(raw.slice(raw.indexOf("["))).length;

function denoAvailable() {
  try {
    execFileSync("deno", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const direct = denoAvailable();
const denoArgs = [
  "test",
  "--allow-env=SUPABASE_URL,SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY,N8N_SHARED_TOKEN,N8N_ADMIN_SHARED_TOKEN,N8N_CALENDAR_TOKEN,GOOGLE_CLIENT_ID,GOOGLE_CLIENT_SECRET",
  "supabase/functions/_tests",
];
const denoEnv = {
  ...process.env,
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  N8N_SHARED_TOKEN: "test-operational-token",
  N8N_ADMIN_SHARED_TOKEN: "test-admin-token",
  N8N_CALENDAR_TOKEN: "test-calendar-token",
  GOOGLE_CLIENT_ID: "test-client-id",
  GOOGLE_CLIENT_SECRET: "test-client-secret",
};
const denoOutput = direct
  ? execFileSync("deno", denoArgs, { encoding: "utf8", env: denoEnv })
  : execFileSync("npx", ["--yes", "deno@2.9.5", ...denoArgs], { encoding: "utf8", shell: true, env: denoEnv });
const denoMatch = denoOutput.match(/(\d+) passed/);
if (!denoMatch) {
  console.error("Could not parse the Deno test count from its output. Output was:");
  console.error(denoOutput);
  process.exit(1);
}
const denoCount = Number(denoMatch[1]);

const actual = vitestCount + denoCount;

const readme = readFileSync(README, "utf8");
const matches = [...readme.matchAll(CLAIMS)];

if (matches.length === 0) {
  console.error(`${README} no longer states a test count anywhere. Either restore a claim or`);
  console.error(`delete this check -- an unstated claim is fine, a silently unverified one is`);
  console.error(`not. Actual count: ${actual}.`);
  process.exit(1);
}

let ok = true;
for (const match of matches) {
  const claimed = Number(match[1] ?? match[2]);
  const line = readme.slice(0, match.index).split("\n").length;
  if (claimed !== actual) {
    console.error(`${README}:${line} claims ${claimed} tests ("${match[0]}"); the suite collects ${actual}.`);
    ok = false;
  }
}

if (!ok) {
  console.error(`Update every claim in ${README} to ${actual}.`);
  process.exit(1);
}

console.log(
  `${README}: all ${matches.length} test-count claim(s) match the suite ` +
    `(${actual} = ${vitestCount} vitest + ${denoCount} deno).`,
);
