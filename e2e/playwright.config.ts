import { defineConfig } from "@playwright/test";

/**
 * On-demand E2E suite against PRODUCTION. Not a CI job, not scheduled.
 *
 * A full run spends real credits, real OpenAI calls, one real WhatsApp message
 * and (in TESTE 5) creates a real Google Calendar event. Everything here is set
 * so that a run is slow, serial and observable rather than fast and parallel.
 */
export default defineConfig({
  testDir: "./specs",
  // 35 minutes is the agreed ceiling for ONE infrastructure wait. TESTE 1 has
  // three of them back to back — search, copy generation, the send queue's
  // 15-minute cycle — so a 40-minute overall budget kills the test mid-wait
  // rather than letting any step reach its own ceiling. Measured: a search
  // alone has taken 15 minutes. The budget is the sum plus room for the UI
  // steps between them.
  timeout: 115 * 60 * 1000,
  expect: { timeout: 15_000 },

  // Serial, always. Every test drives the same lead, the same account and the
  // same send queue — running two at once would have them overwrite each other.
  fullyParallel: false,
  workers: 1,

  // No retries. A retry costs credits, sends another real WhatsApp message and
  // can book another meeting. A flake here is information, not noise to hide.
  retries: 0,

  // Specs run in filename order, and the numbering is the dependency order.
  // 00-preflight aborts the run before anything is spent.
  reporter: [["list"], ["html", { outputFolder: "report", open: "never" }]],
  outputDir: "./test-results",

  use: {
    headless: true,
    trace: "retain-on-failure",
    video: "off",
    screenshot: "only-on-failure",
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  },

  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
