#!/usr/bin/env node
// Runs the Deno test suite under supabase/functions/_tests/ -- the behavioral
// tests that call the deployed edge function handlers directly (a routed
// fetch stub in place of the network), rather than reading their source as
// text the way src/test/n8n-proxy-guards.test.ts does. Both kinds of test
// exist in this repo on purpose: source-text checks catch a call site that
// stopped calling a guard; these catch the guard behaving wrong even when it
// is still being called.
//
// The env vars below are synthetic placeholders, the same pattern ci.yml
// already uses for VITE_SUPABASE_* in the `verify` job -- never real
// secrets, only well-formed enough for `createClient()` and the auth-header
// comparisons under test to accept them.
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = "supabase/functions/_tests";

function testFiles(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) testFiles(full, acc);
    else if (entry.name.endsWith(".test.ts")) acc.push(full.split("\\").join("/"));
  }
  return acc;
}

const files = testFiles(ROOT);

// Guards the guard, the same way check-functions-types.mjs does: a directory
// that stopped resolving would make `deno test` exit 0 having run nothing.
const FLOOR = 5;
if (files.length < FLOOR) {
  console.error(`Only ${files.length} test files found under ${ROOT}/ -- expected at least ${FLOOR}.`);
  console.error(`Either the directory moved or this script stopped finding it.`);
  process.exit(1);
}

const TEST_ENV = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  N8N_SHARED_TOKEN: "test-operational-token",
  N8N_ADMIN_SHARED_TOKEN: "test-admin-token",
  N8N_CALENDAR_TOKEN: "test-calendar-token",
  GOOGLE_CLIENT_ID: "test-client-id",
  GOOGLE_CLIENT_SECRET: "test-client-secret",
};

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

const allowEnv = `--allow-env=${Object.keys(TEST_ENV).join(",")}`;
const args = ["test", allowEnv, ROOT];

console.log(`deno test: ${files.length} files under ${ROOT}/`);
try {
  if (direct) {
    execFileSync("deno", args, { stdio: "inherit", env: { ...process.env, ...TEST_ENV } });
  } else {
    execFileSync("npx", ["--yes", PINNED, ...args], {
      stdio: "inherit",
      shell: true,
      env: { ...process.env, ...TEST_ENV },
    });
  }
} catch (error) {
  process.exit(error.status ?? 1);
}
