import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// OPS-005: merged edge-function code was not deployed by anything. The repo
// described guards that production did not have, and no test could catch it,
// because every existing test asserts what the *source* does -- and the source
// was correct. What was missing was the step that carries the source to the
// runtime.
//
// So this file asserts the pipeline, not the code. It is deliberately written
// against the class ("a function exists that nothing deploys") rather than the
// instance ("n8n-proxy was stale on 2026-08-18"): the third assertion fails if
// anyone replaces the deploy-all with a hand-maintained list, which is the only
// way a *new* function could quietly go undeployed again.

const CI = readFileSync(resolve(__dirname, "../../.github/workflows/ci.yml"), "utf8");
const FUNCTIONS_DIR = resolve(__dirname, "../../supabase/functions");

function deployableFunctions(): string[] {
  return readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .map((entry) => entry.name)
    .sort();
}

describe("CI deploys the edge functions", () => {
  it("has a job that runs `supabase functions deploy`", () => {
    expect(CI).toContain("deploy-functions:");
    expect(CI).toMatch(/run:\s*supabase functions deploy/);
  });

  it("deploys only after the verify job passes, and only on main", () => {
    const job = CI.slice(CI.indexOf("deploy-functions:"));
    expect(job).toContain("needs: verify");
    expect(job).toContain("github.ref == 'refs/heads/main'");
    expect(job).toContain("github.event_name == 'push'");
  });

  it("names no function, so a newly added one is deployed without a code change", () => {
    const command = CI.match(/run:\s*(supabase functions deploy[^\n]*)/)?.[1] ?? "";
    expect(command).not.toBe("");

    // Everything after `deploy` must be a flag. A bare word there would be a
    // function slug, which turns the deploy into an allow-list that a new
    // function has to be remembered into -- the exact shape of the defect.
    const args = command.replace("supabase functions deploy", "").trim().split(/\s+/).filter(Boolean);
    const slugs = args.filter((arg, i) => !arg.startsWith("--") && !args[i - 1]?.startsWith("--"));
    expect(slugs).toEqual([]);
  });

  it("every deployable directory is a function the CLI can actually deploy", () => {
    const functions = deployableFunctions();
    expect(functions.length).toBeGreaterThan(0);

    // `functions deploy` with no slug walks this directory. A folder without an
    // entrypoint would fail the whole job -- and a failing deploy job is fine,
    // a silently skipped one is not, so this keeps the failure at test time.
    for (const name of functions) {
      expect(
        existsSync(resolve(FUNCTIONS_DIR, name, "index.ts")),
        `supabase/functions/${name} has no index.ts`,
      ).toBe(true);
    }
  });

  it("declares every token-authenticated function as verify_jwt = false", () => {
    // A deploy re-reads config.toml. If a function that authenticates itself
    // with a shared token or a webhook signature loses its entry here, the
    // gateway starts rejecting its callers before the body runs -- and it would
    // happen at deploy time, not at merge time, which is hard to trace back.
    const config = readFileSync(resolve(__dirname, "../../supabase/config.toml"), "utf8");
    const tokenAuthenticated = [
      "n8n-proxy",
      "send-queue-poll",
      "process-email-queue",
      "send-ops-alert",
      "auth-email-hook",
      "google-calendar-auth-url",
      "google-calendar-callback",
      "webhook-proxy",
    ];
    for (const name of tokenAuthenticated) {
      const section = config.slice(config.indexOf(`[functions.${name}]`));
      expect(section.slice(0, 200), `${name} must keep verify_jwt = false`).toContain(
        "verify_jwt = false",
      );
    }
  });
});

// ---------------------------------------------------------------------------
// `npm run typecheck` is tsc over tsconfig.app.json (include: ["src"]) and
// tsconfig.node.json (vite.config.ts) -- neither reaches supabase/functions/,
// so the edge functions need their own type-check step, run under `deno
// check` (the same checker they actually run under; see
// scripts/check-functions-types.mjs).
//
// This asserts that the *step* exists and runs before deploy, not that a
// comment claims it does -- a gate on prose would pass the moment the prose
// did, whether or not the step behind it was real.

const PACKAGE = JSON.parse(
  readFileSync(resolve(__dirname, "../../package.json"), "utf8"),
) as { scripts: Record<string, string> };

describe("CI type-checks the edge functions before deploying them", () => {
  const verifyJob = CI.slice(CI.indexOf("verify:"), CI.indexOf("deploy-functions:"));

  it("runs the deno type-check inside the verify job", () => {
    expect(verifyJob).toContain("npm run functions:check");
  });

  it("installs Deno before running it", () => {
    expect(verifyJob).toContain("denoland/setup-deno");
    expect(verifyJob.indexOf("denoland/setup-deno")).toBeLessThan(
      verifyJob.indexOf("npm run functions:check"),
    );
  });

  it("gates the deploy on that check, by keeping it in the job the deploy needs", () => {
    // deploy-functions declares `needs: verify`. Putting the type-check in a
    // job of its own would let a function that does not compile ship anyway,
    // green somewhere else on the page.
    const deployJob = CI.slice(CI.indexOf("deploy-functions:"));
    expect(deployJob).toContain("needs: verify");
    expect(deployJob).not.toContain("npm run functions:check");
  });

  it("keeps both new checks in `npm run check`, so the local run matches CI", () => {
    expect(PACKAGE.scripts.check).toContain("npm run functions:check");
    expect(PACKAGE.scripts.check).toContain("npm run env:check");
    expect(PACKAGE.scripts["functions:check"]).toBeTruthy();
    expect(PACKAGE.scripts["env:check"]).toBeTruthy();
  });

  it("has no type-check suppression anywhere under supabase/functions/", () => {
    // The cheapest way to make `deno check` pass is to silence it. Measured
    // when the gate was added: zero suppressions and zero errors across all 24
    // files, so this starts from a clean floor rather than grandfathering a
    // list -- which is the only version of this assertion worth having.
    const suppressions: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name)) {
          const contents = readFileSync(full, "utf8");
          for (const match of contents.matchAll(/@ts-(nocheck|ignore|expect-error)/g)) {
            const line = contents.slice(0, match.index).split("\n").length;
            suppressions.push(`${entry.name}:${line} — ${match[0]}`);
          }
        }
      }
    };
    walk(FUNCTIONS_DIR);
    expect(suppressions).toEqual([]);
  });
});
