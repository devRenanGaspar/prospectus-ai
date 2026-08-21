export interface SystemHealthQueue {
  queue_name: string;
  captured_at: string;
  queue_depth: number;
  oldest_age_seconds: number | null;
  processing_count: number;
  failed_count: number;
}

export interface SystemHealthSnapshot {
  captured_at: string;
  telemetry: {
    first_event_at: string | null;
    last_event_at: string | null;
    events_24h: number;
    errors_24h: number;
    frontend_errors_24h: number;
    frontend_sessions_24h: number;
    web_vitals_24h: number;
  };
  stuck: {
    searches: number;
    searches_oldest_seconds: number;
    copy_requests: number;
    copy_oldest_seconds: number;
    leads: number;
    copy_pending_leads: number;
    send_pending_leads: number;
    leads_oldest_seconds: number;
  };
  operations: {
    active: number;
    queued: number;
    processing: number;
    failed: number;
    oldest_active_at: string | null;
  };
  queues: SystemHealthQueue[];
  coverage: {
    synthetic_availability: boolean;
    queue_snapshots: boolean;
    platform_metrics: boolean;
  };
}

export interface BaselineMetric {
  median: number | null;
  p10: number | null;
  p90: number | null;
}

export interface SystemHealthHistory {
  frequency_minutes: number;
  retention_days: number;
  rollup_retention_days: number;
  window_hours: number;
  first_captured_at: string | null;
  last_captured_at: string | null;
  samples: number;
  expected_samples: number;
  reference: {
    status: "collecting" | "ready";
    samples: number;
    minimum_samples: number;
    lookback_days: number;
    comparison: "same_hour_of_day";
    metrics: {
      stuck_total: BaselineMetric;
      telemetry_errors_24h: BaselineMetric;
      operations_active: BaselineMetric;
      queue_depth: BaselineMetric;
    };
  };
}

export type SignalLevel = "healthy" | "warning" | "critical" | "unknown";
export type BaselinePosition = "collecting" | "within" | "above" | "below";

export function getBaselinePosition(value: number | null, metric: BaselineMetric): BaselinePosition {
  if (value === null || metric.p10 === null || metric.p90 === null) return "collecting";
  if (value > metric.p90) return "above";
  if (value < metric.p10) return "below";
  return "within";
}

export function getHistoryCoverage(history: SystemHealthHistory) {
  if (history.expected_samples <= 0) return 0;
  return Math.min(100, Math.round((history.samples / history.expected_samples) * 100));
}

export function getAttentionLevel(snapshot: SystemHealthSnapshot): SignalLevel {
  if (
    snapshot.stuck.searches > 0 ||
    snapshot.stuck.copy_requests > 0 ||
    snapshot.stuck.leads > 0 ||
    snapshot.operations.failed > 0
  ) return "critical";

  if (!snapshot.telemetry.last_event_at || !snapshot.coverage.queue_snapshots) return "warning";
  return "healthy";
}

export function getTelemetryLevel(snapshot: SystemHealthSnapshot): SignalLevel {
  if (!snapshot.telemetry.last_event_at) return "unknown";
  if (snapshot.telemetry.errors_24h > 0) return "critical";

  const age = new Date(snapshot.captured_at).getTime() - new Date(snapshot.telemetry.last_event_at).getTime();
  return age > 24 * 60 * 60 * 1000 ? "warning" : "healthy";
}

export function formatDuration(seconds: number | null | undefined) {
  if (!seconds || seconds <= 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}min`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

export function formatSnapshotTime(value: string | null) {
  if (!value) return "Sem dados";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}
