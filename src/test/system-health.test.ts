import { describe, expect, it } from "vitest";
import {
  formatDuration,
  getAttentionLevel,
  getBaselinePosition,
  getHistoryCoverage,
  getTelemetryLevel,
  type SystemHealthHistory,
  type SystemHealthSnapshot,
} from "@/lib/system-health";

const snapshot: SystemHealthSnapshot = {
  captured_at: "2026-08-07T12:00:00.000Z",
  telemetry: {
    first_event_at: "2026-08-06T10:00:00.000Z",
    last_event_at: "2026-08-07T11:50:00.000Z",
    events_24h: 10,
    errors_24h: 0,
    frontend_errors_24h: 0,
    frontend_sessions_24h: 2,
    web_vitals_24h: 5,
  },
  stuck: {
    searches: 0,
    searches_oldest_seconds: 0,
    copy_requests: 0,
    copy_oldest_seconds: 0,
    leads: 0,
    copy_pending_leads: 0,
    send_pending_leads: 0,
    leads_oldest_seconds: 0,
  },
  operations: { active: 0, queued: 0, processing: 0, failed: 0, oldest_active_at: null },
  queues: [],
  coverage: { synthetic_availability: false, queue_snapshots: true, platform_metrics: false },
};

describe("system health helpers", () => {
  it("marks stuck paid operations as critical", () => {
    expect(getAttentionLevel({ ...snapshot, stuck: { ...snapshot.stuck, leads: 1 } })).toBe("critical");
  });

  it("does not call missing queue telemetry healthy", () => {
    expect(getAttentionLevel({ ...snapshot, coverage: { ...snapshot.coverage, queue_snapshots: false } })).toBe("warning");
  });

  it("marks recent error-free telemetry healthy", () => {
    expect(getTelemetryLevel(snapshot)).toBe("healthy");
  });

  it("marks telemetry older than 24 hours as warning", () => {
    expect(getTelemetryLevel({ ...snapshot, telemetry: { ...snapshot.telemetry, last_event_at: "2026-08-05T11:00:00.000Z" } })).toBe("warning");
  });

  it("formats operational ages", () => {
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(120)).toBe("2min");
    expect(formatDuration(7200)).toBe("2.0h");
    expect(formatDuration(172800)).toBe("2.0d");
  });

  it("positions a current value against the historical range", () => {
    const metric = { median: 10, p10: 5, p90: 15 };
    expect(getBaselinePosition(10, metric)).toBe("within");
    expect(getBaselinePosition(16, metric)).toBe("above");
    expect(getBaselinePosition(4, metric)).toBe("below");
    expect(getBaselinePosition(null, metric)).toBe("collecting");
  });

  it("caps historical coverage at one hundred percent", () => {
    const history = { samples: 90, expected_samples: 84 } as SystemHealthHistory;
    expect(getHistoryCoverage(history)).toBe(100);
  });
});
