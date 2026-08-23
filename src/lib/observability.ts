import { supabase } from "@/integrations/supabase/client";
import {
  onCLS,
  onFCP,
  onINP,
  onLCP,
  onTTFB,
  type MetricType,
} from "web-vitals";

const SESSION_STORAGE_KEY = "prospectus:ops-session";
const FUNCTION_NAME = "frontend-telemetry";
const FLUSH_INTERVAL_MS = 5_000;
const ERROR_DEDUPLICATION_MS = 30_000;
const MAX_EVENTS_PER_PAGE = 60;
const MAX_BATCH_SIZE = 10;
const MAX_RETRIES = 3;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EXACT_ROUTES = new Set([
  "/",
  "/login",
  "/check-email",
  "/reset-password",
  "/privacy",
  "/about",
  "/lp",
  "/vendas",
  "/dashboard",
  "/settings",
  "/context",
  "/leads/board",
  "/billing/plans",
  "/billing/usage",
  "/admin/users",
  "/admin/plans",
  "/admin/costs",
  "/admin/webhooks",
  "/admin/lead-pool",
  "/admin/maintenance",
  "/admin/announcements",
  "/admin/system-health",
]);

export type FrontendErrorCode =
  | "JAVASCRIPT_RUNTIME_ERROR"
  | "UNHANDLED_REJECTION"
  | "RESOURCE_LOAD_ERROR"
  | "REACT_RENDER_ERROR";

export type SafeTelemetryAttribute = string | number | boolean | null;

export interface FrontendTelemetryEvent {
  event_id: string;
  event_name:
    | "frontend.web_vital"
    | "frontend.javascript_error"
    | "frontend.navigation";
  occurred_at: string;
  session_id: string;
  route_key: string;
  duration_ms?: number;
  error_code?: FrontendErrorCode;
  attributes: Record<string, SafeTelemetryAttribute>;
}

interface QueuedEvent {
  event: FrontendTelemetryEvent;
  attempts: number;
}

export type FrontendTelemetryTransport = (
  events: FrontendTelemetryEvent[],
) => Promise<boolean>;

export interface FrontendTelemetryBufferOptions {
  maxEvents?: number;
  maxBatchSize?: number;
  maxRetries?: number;
}

export class FrontendTelemetryBuffer {
  private readonly queue: QueuedEvent[] = [];
  private readonly maxEvents: number;
  private readonly maxBatchSize: number;
  private readonly maxRetries: number;
  private acceptedCount = 0;
  private flushing = false;

  constructor(
    private readonly transport: FrontendTelemetryTransport,
    options: FrontendTelemetryBufferOptions = {},
  ) {
    this.maxEvents = options.maxEvents ?? MAX_EVENTS_PER_PAGE;
    this.maxBatchSize = options.maxBatchSize ?? MAX_BATCH_SIZE;
    this.maxRetries = options.maxRetries ?? MAX_RETRIES;
  }

  get pendingCount() {
    return this.queue.length;
  }

  enqueue(event: FrontendTelemetryEvent) {
    if (this.acceptedCount >= this.maxEvents) return false;

    this.acceptedCount += 1;
    this.queue.push({ event, attempts: 0 });
    return true;
  }

  /** Drops everything pending. Used when a user refuses analytics consent. */
  discard() {
    this.queue.length = 0;
  }

  async flush() {
    if (this.flushing || this.queue.length === 0) return false;

    this.flushing = true;
    const batch = this.queue.slice(0, this.maxBatchSize);

    try {
      const sent = await this.transport(batch.map((item) => item.event));
      if (sent) {
        this.queue.splice(0, batch.length);
        return true;
      }

      for (const item of batch) item.attempts += 1;
      this.queue.splice(
        0,
        batch.length,
        ...batch.filter((item) => item.attempts < this.maxRetries),
      );
      return false;
    } catch {
      for (const item of batch) item.attempts += 1;
      this.queue.splice(
        0,
        batch.length,
        ...batch.filter((item) => item.attempts < this.maxRetries),
      );
      return false;
    } finally {
      this.flushing = false;
    }
  }
}

export function sanitizeRouteKey(pathname: string) {
  const normalized = pathname.split(/[?#]/, 1)[0].replace(/\/+$/, "") || "/";
  if (EXACT_ROUTES.has(normalized)) return normalized;
  if (/^\/leads\/[^/]+$/.test(normalized)) return "/leads/:leadId";
  return "/not-found";
}

function createUuid() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
    .slice(6, 8)
    .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function getSessionId() {
  try {
    const existing = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing && UUID_PATTERN.test(existing)) return existing;

    const created = createUuid();
    sessionStorage.setItem(SESSION_STORAGE_KEY, created);
    return created;
  } catch {
    return createUuid();
  }
}

function parseSampleRate(value: string | undefined) {
  if (!value) return 1;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 1;
}

function isSessionSampled(sessionId: string, sampleRate: number) {
  if (sampleRate >= 1) return true;
  if (sampleRate <= 0) return false;

  const bucket = Number.parseInt(sessionId.replace(/-/g, "").slice(0, 8), 16);
  return bucket / 0xffffffff < sampleRate;
}

function safeBuildAttribute(value: string | undefined) {
  if (!value || value.length > 128 || !/^[A-Za-z0-9._-]+$/.test(value)) {
    return undefined;
  }
  return value;
}

function getConnectionType() {
  const connection = (
    navigator as Navigator & { connection?: { effectiveType?: string } }
  ).connection;
  const effectiveType = connection?.effectiveType;
  return effectiveType && ["slow-2g", "2g", "3g", "4g"].includes(effectiveType)
    ? effectiveType
    : "unknown";
}

const sampleRate = parseSampleRate(import.meta.env.VITE_OBSERVABILITY_SAMPLE_RATE);
const release = safeBuildAttribute(import.meta.env.VITE_APP_RELEASE);
const build = safeBuildAttribute(import.meta.env.VITE_APP_BUILD);
const sessionId = getSessionId();
const sampledSession = isSessionSampled(sessionId, sampleRate);
let currentRouteKey = sanitizeRouteKey(window.location.pathname);
let started = false;
let cleanup: (() => void) | undefined;
const recentErrors = new Map<string, number>();

function commonAttributes(eventSampleRate: number) {
  return {
    sample_rate: eventSampleRate,
    connection_type: getConnectionType(),
    visibility_state: document.visibilityState,
    ...(release ? { release } : {}),
    ...(build ? { build } : {}),
  };
}

export function createWebVitalEvent(
  metric: Pick<MetricType, "name" | "value" | "rating" | "navigationType">,
  context: {
    sessionId: string;
    routeKey: string;
    sampleRate: number;
    connectionType: string;
    visibilityState: string;
    release?: string;
    build?: string;
  },
): FrontendTelemetryEvent {
  const duration = metric.name === "CLS" ? undefined : Math.max(0, Math.round(metric.value));

  return {
    event_id: createUuid(),
    event_name: "frontend.web_vital",
    occurred_at: new Date().toISOString(),
    session_id: context.sessionId,
    route_key: context.routeKey,
    ...(duration === undefined ? {} : { duration_ms: duration }),
    attributes: {
      metric: metric.name,
      rating: metric.rating,
      navigation_type: metric.navigationType,
      sample_rate: context.sampleRate,
      connection_type: context.connectionType,
      visibility_state: context.visibilityState,
      ...(context.release ? { release: context.release } : {}),
      ...(context.build ? { build: context.build } : {}),
    },
  };
}

async function sendEvents(events: FrontendTelemetryEvent[]) {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return false;

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${FUNCTION_NAME}`,
      {
        method: "POST",
        keepalive: true,
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ events }),
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}

const buffer = new FrontendTelemetryBuffer(sendEvents);

/**
 * Whether this session's analytics consent has been resolved, and how.
 *
 * Three states rather than a boolean, because of when the collector starts:
 * `startFrontendObservability()` runs in `main.tsx` before React mounts, and
 * `<FrontendRouteObserver />` sits outside `<AuthProvider>`. Events are
 * therefore already queued by the time a profile — and its consent — can
 * possibly be known. A plain `if (consent)` at the emission point would not
 * protect the initial page load, which is when most of this fires.
 *
 * So `unknown` does not mean "drop": it means **hold**. Events keep queueing
 * and nothing leaves the browser until the answer is in.
 */
export type TelemetryConsent = "unknown" | "granted" | "denied";

let telemetryConsent: TelemetryConsent = "unknown";

export function getTelemetryConsent(): TelemetryConsent {
  return telemetryConsent;
}

/**
 * Called once the session is resolved: `granted` releases the held queue,
 * `denied` throws it away, and `unknown` (on sign-out) holds again.
 */
export function setTelemetryConsent(next: TelemetryConsent) {
  telemetryConsent = next;
  if (next === "denied") {
    buffer.discard();
  } else if (next === "granted") {
    void buffer.flush();
  }
}

/** The only path to the network. Nothing is sent while consent is unresolved. */
function flushIfConsented() {
  if (telemetryConsent !== "granted") return;
  void buffer.flush();
}

export function recordFrontendRoute(
  pathname: string,
  navigationType: "navigate" | "soft-navigation",
) {
  currentRouteKey = sanitizeRouteKey(pathname);
  if (!sampledSession) return;
  if (telemetryConsent === "denied") return;

  buffer.enqueue({
    event_id: createUuid(),
    event_name: "frontend.navigation",
    occurred_at: new Date().toISOString(),
    session_id: sessionId,
    route_key: currentRouteKey,
    attributes: {
      ...commonAttributes(sampleRate),
      navigation_type: navigationType,
    },
  });
}

export function recordFrontendError(errorCode: FrontendErrorCode) {
  if (telemetryConsent === "denied") return;
  const deduplicationKey = `${currentRouteKey}:${errorCode}`;
  const now = Date.now();
  if (now - (recentErrors.get(deduplicationKey) ?? 0) < ERROR_DEDUPLICATION_MS) {
    return;
  }
  recentErrors.set(deduplicationKey, now);

  buffer.enqueue({
    event_id: createUuid(),
    event_name: "frontend.javascript_error",
    occurred_at: new Date(now).toISOString(),
    session_id: sessionId,
    route_key: currentRouteKey,
    error_code: errorCode,
    attributes: commonAttributes(1),
  });
}

function startWebVitals() {
  const report = (metric: MetricType) => {
    if (!sampledSession) return;
    if (telemetryConsent === "denied") return;
    const event = createWebVitalEvent(metric, {
      sessionId,
      routeKey: currentRouteKey,
      sampleRate,
      connectionType: getConnectionType(),
      visibilityState: document.visibilityState,
      release,
      build,
    });
    buffer.enqueue(event);
  };

  onCLS(report);
  onFCP(report);
  onINP(report);
  onLCP(report);
  onTTFB(report);
}

export function startFrontendObservability() {
  if (started) return cleanup;
  started = true;

  const handleError = (event: Event) => {
    recordFrontendError(
      event instanceof ErrorEvent ? "JAVASCRIPT_RUNTIME_ERROR" : "RESOURCE_LOAD_ERROR",
    );
  };
  const handleRejection = () => recordFrontendError("UNHANDLED_REJECTION");
  const handleVisibility = () => {
    if (document.visibilityState === "hidden") flushIfConsented();
  };
  const handlePageHide = () => flushIfConsented();
  const intervalId = window.setInterval(flushIfConsented, FLUSH_INTERVAL_MS);

  window.addEventListener("error", handleError, true);
  window.addEventListener("unhandledrejection", handleRejection);
  document.addEventListener("visibilitychange", handleVisibility);
  window.addEventListener("pagehide", handlePageHide);
  try {
    startWebVitals();
  } catch {
    // Telemetry support varies by browser and must never block application boot.
  }

  cleanup = () => {
    window.clearInterval(intervalId);
    window.removeEventListener("error", handleError, true);
    window.removeEventListener("unhandledrejection", handleRejection);
    document.removeEventListener("visibilitychange", handleVisibility);
    window.removeEventListener("pagehide", handlePageHide);
    started = false;
    cleanup = undefined;
  };

  return cleanup;
}
