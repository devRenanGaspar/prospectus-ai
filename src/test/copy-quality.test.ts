import { describe, expect, it } from "vitest";
import {
  formatPercent,
  getCheckLabel,
  getCopyQualityLevel,
  getCronRunLevel,
  type CopyQualityCheck,
  type CopyQualitySnapshot,
} from "@/lib/copy-quality";

const check = (overrides: Partial<CopyQualityCheck> = {}): CopyQualityCheck => ({
  test_id: "CP-T01",
  check_name: "reviews_superestimado",
  severity: "gate",
  universo_total: 100,
  falhas_total: 0,
  taxa_total_pct: 0,
  universo_24h: 10,
  falhas_24h: 0,
  taxa_24h_pct: 0,
  is_regression: false,
  ...overrides,
});

const snapshot = (overrides: Partial<CopyQualitySnapshot> = {}): CopyQualitySnapshot => ({
  last_captured_at: new Date().toISOString(),
  schedule: "0 6 * * *",
  job_active: true,
  last_run: null,
  last_alert_sent_at: null,
  checks: [check()],
  ...overrides,
});

describe("copy quality helpers", () => {
  it("marks a clean snapshot as healthy", () => {
    expect(getCopyQualityLevel(snapshot())).toBe("healthy");
  });

  it("marks a known chronic backlog as warning, not critical", () => {
    const s = snapshot({ checks: [check({ falhas_total: 254, is_regression: false })] });
    expect(getCopyQualityLevel(s)).toBe("warning");
  });

  it("marks a real regression as critical", () => {
    const s = snapshot({ checks: [check({ falhas_total: 1, falhas_24h: 1, is_regression: true })] });
    expect(getCopyQualityLevel(s)).toBe("critical");
  });

  it("has no reading when the cron never ran", () => {
    expect(getCopyQualityLevel(snapshot({ checks: [] }))).toBe("unknown");
  });

  it("flags an inactive cron job as critical regardless of last run", () => {
    expect(getCronRunLevel(snapshot({ job_active: false }))).toBe("critical");
  });

  it("has no reading before the first capture", () => {
    expect(getCronRunLevel(snapshot({ last_captured_at: null }))).toBe("unknown");
  });

  it("is healthy right after a capture", () => {
    expect(getCronRunLevel(snapshot())).toBe("healthy");
  });

  it("warns once the daily run is overdue by more than a day", () => {
    const stale = new Date(Date.now() - 27 * 60 * 60 * 1000).toISOString();
    expect(getCronRunLevel(snapshot({ last_captured_at: stale }))).toBe("warning");
  });

  it("is critical once the daily run has been missing for over 30h", () => {
    const veryStale = new Date(Date.now() - 31 * 60 * 60 * 1000).toISOString();
    expect(getCronRunLevel(snapshot({ last_captured_at: veryStale }))).toBe("critical");
  });

  it("formats percentages with one decimal, pt-BR style", () => {
    expect(formatPercent(41.3)).toBe("41,3%");
    expect(formatPercent(0)).toBe("0,0%");
    expect(formatPercent(null)).toBe("—");
  });

  it("falls back to the raw check_name when there is no label", () => {
    expect(getCheckLabel("reviews_superestimado")).toBe("Nº de avaliações inflado");
    expect(getCheckLabel("algo_novo_sem_label")).toBe("algo_novo_sem_label");
  });
});
