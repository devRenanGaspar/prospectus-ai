const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_BUILD_PATTERN = /^[A-Za-z0-9._-]+$/;
const MAX_EVENT_AGE_MS = 24 * 60 * 60 * 1_000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000;

const ROUTE_KEYS = new Set([
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
  "/leads/:leadId",
  "/billing/plans",
  "/billing/usage",
  "/admin/users",
  "/admin/plans",
  "/admin/costs",
  "/admin/webhooks",
  "/admin/lead-pool",
  "/admin/maintenance",
  "/admin/announcements",
  "/not-found",
]);

const EVENT_NAMES = new Set([
  "frontend.web_vital",
  "frontend.javascript_error",
  "frontend.navigation",
]);

const ERROR_CODES = new Set([
  "JAVASCRIPT_RUNTIME_ERROR",
  "UNHANDLED_REJECTION",
  "RESOURCE_LOAD_ERROR",
  "REACT_RENDER_ERROR",
]);

const EVENT_KEYS = new Set([
  "event_id",
  "event_name",
  "occurred_at",
  "session_id",
  "route_key",
  "duration_ms",
  "error_code",
  "attributes",
]);

const COMMON_ATTRIBUTE_KEYS = new Set([
  "sample_rate",
  "connection_type",
  "visibility_state",
  "release",
  "build",
]);

const WEB_VITAL_ATTRIBUTE_KEYS = new Set([
  ...COMMON_ATTRIBUTE_KEYS,
  "metric",
  "rating",
  "navigation_type",
]);

const NAVIGATION_ATTRIBUTE_KEYS = new Set([
  ...COMMON_ATTRIBUTE_KEYS,
  "navigation_type",
]);

const METRICS = new Set(["CLS", "FCP", "INP", "LCP", "TTFB"]);
const RATINGS = new Set(["good", "needs-improvement", "poor"]);
const NAVIGATION_TYPES = new Set([
  "navigate",
  "reload",
  "back-forward",
  "back-forward-cache",
  "prerender",
  "restore",
  "soft-navigation",
]);
const CONNECTION_TYPES = new Set(["slow-2g", "2g", "3g", "4g", "unknown"]);
const VISIBILITY_STATES = new Set(["visible", "hidden", "prerender", "unknown"]);

type Scalar = string | number | boolean | null;

function isScalar(value: unknown): value is Scalar {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

export interface SafeFrontendTelemetryEvent {
  event_id: string;
  event_name: string;
  occurred_at: string;
  session_id: string;
  route_key: string;
  duration_ms?: number;
  error_code?: string;
  attributes: Record<string, Scalar>;
}

export class TelemetryValidationError extends Error {
  constructor(
    readonly code: string,
    readonly status = 400,
  ) {
    super(code);
    this.name = "TelemetryValidationError";
  }
}

function fail(code: string): never {
  throw new TelemetryValidationError(code);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireUuid(value: unknown, code: string) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) fail(code);
  return value;
}

function requireSafeTimestamp(value: unknown, now: Date) {
  if (typeof value !== "string") fail("INVALID_OCCURRED_AT");
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) fail("INVALID_OCCURRED_AT");
  if (
    timestamp < now.getTime() - MAX_EVENT_AGE_MS ||
    timestamp > now.getTime() + MAX_FUTURE_SKEW_MS
  ) {
    fail("OCCURRED_AT_OUT_OF_RANGE");
  }
  return new Date(timestamp).toISOString();
}

function validateAttributes(
  value: unknown,
  allowedKeys: Set<string>,
): Record<string, Scalar> {
  if (!isRecord(value)) fail("INVALID_ATTRIBUTES");

  const entries = Object.entries(value);
  if (entries.length > 8) fail("TOO_MANY_ATTRIBUTES");

  const attributes: Record<string, Scalar> = {};
  for (const [key, attribute] of entries) {
    if (!allowedKeys.has(key)) fail("UNSAFE_ATTRIBUTE_KEY");
    if (!isScalar(attribute)) {
      fail("UNSAFE_ATTRIBUTE_VALUE");
    }
    if (typeof attribute === "string" && attribute.length > 128) {
      fail("ATTRIBUTE_VALUE_TOO_LONG");
    }
    if (typeof attribute === "number" && !Number.isFinite(attribute)) {
      fail("UNSAFE_ATTRIBUTE_VALUE");
    }
    attributes[key] = attribute;
  }

  if (
    typeof attributes.sample_rate !== "number" ||
    attributes.sample_rate <= 0 ||
    attributes.sample_rate > 1
  ) {
    fail("INVALID_SAMPLE_RATE");
  }
  if (
    typeof attributes.connection_type !== "string" ||
    !CONNECTION_TYPES.has(attributes.connection_type)
  ) {
    fail("INVALID_CONNECTION_TYPE");
  }
  if (
    typeof attributes.visibility_state !== "string" ||
    !VISIBILITY_STATES.has(attributes.visibility_state)
  ) {
    fail("INVALID_VISIBILITY_STATE");
  }
  for (const key of ["release", "build"]) {
    const attribute = attributes[key];
    if (
      attribute !== undefined &&
      (typeof attribute !== "string" || !SAFE_BUILD_PATTERN.test(attribute))
    ) {
      fail("INVALID_BUILD_ATTRIBUTE");
    }
  }

  return attributes;
}

function validateEvent(value: unknown, now: Date): SafeFrontendTelemetryEvent {
  if (!isRecord(value)) fail("INVALID_EVENT");
  if (Object.keys(value).some((key) => !EVENT_KEYS.has(key))) {
    fail("UNEXPECTED_EVENT_FIELD");
  }

  const eventId = requireUuid(value.event_id, "INVALID_EVENT_ID");
  const sessionId = requireUuid(value.session_id, "INVALID_SESSION_ID");
  if (typeof value.event_name !== "string" || !EVENT_NAMES.has(value.event_name)) {
    fail("INVALID_EVENT_NAME");
  }
  if (typeof value.route_key !== "string" || !ROUTE_KEYS.has(value.route_key)) {
    fail("INVALID_ROUTE_KEY");
  }

  const event: SafeFrontendTelemetryEvent = {
    event_id: eventId,
    event_name: value.event_name,
    occurred_at: requireSafeTimestamp(value.occurred_at, now),
    session_id: sessionId,
    route_key: value.route_key,
    attributes: {},
  };

  if (value.event_name === "frontend.web_vital") {
    if (value.error_code !== undefined) fail("WEB_VITAL_MUST_NOT_USE_ERROR_CODE");
    const attributes = validateAttributes(value.attributes, WEB_VITAL_ATTRIBUTE_KEYS);
    if (typeof attributes.metric !== "string" || !METRICS.has(attributes.metric)) {
      fail("INVALID_WEB_VITAL_METRIC");
    }
    if (typeof attributes.rating !== "string" || !RATINGS.has(attributes.rating)) {
      fail("INVALID_WEB_VITAL_RATING");
    }
    if (
      typeof attributes.navigation_type !== "string" ||
      !NAVIGATION_TYPES.has(attributes.navigation_type)
    ) {
      fail("INVALID_NAVIGATION_TYPE");
    }

    if (attributes.metric === "CLS") {
      if (value.duration_ms !== undefined) fail("CLS_MUST_NOT_USE_DURATION");
    } else if (
      typeof value.duration_ms !== "number" ||
      !Number.isInteger(value.duration_ms) ||
      value.duration_ms < 0 ||
      value.duration_ms > 604_800_000
    ) {
      fail("INVALID_DURATION");
    }
    event.attributes = attributes;
    if (typeof value.duration_ms === "number") event.duration_ms = value.duration_ms;
  } else if (value.event_name === "frontend.javascript_error") {
    event.attributes = validateAttributes(value.attributes, COMMON_ATTRIBUTE_KEYS);
    if (typeof value.error_code !== "string" || !ERROR_CODES.has(value.error_code)) {
      fail("INVALID_ERROR_CODE");
    }
    if (value.duration_ms !== undefined) fail("ERROR_MUST_NOT_USE_DURATION");
    event.error_code = value.error_code;
  } else {
    const attributes = validateAttributes(value.attributes, NAVIGATION_ATTRIBUTE_KEYS);
    if (
      typeof attributes.navigation_type !== "string" ||
      !new Set(["navigate", "soft-navigation"]).has(attributes.navigation_type)
    ) {
      fail("INVALID_NAVIGATION_TYPE");
    }
    if (value.duration_ms !== undefined || value.error_code !== undefined) {
      fail("INVALID_NAVIGATION_EVENT");
    }
    event.attributes = attributes;
  }

  return event;
}

export function parseFrontendTelemetryPayload(
  value: unknown,
  now = new Date(),
): SafeFrontendTelemetryEvent[] {
  if (!isRecord(value) || Object.keys(value).some((key) => key !== "events")) {
    fail("INVALID_PAYLOAD");
  }
  if (!Array.isArray(value.events) || value.events.length < 1 || value.events.length > 10) {
    fail("INVALID_BATCH_SIZE");
  }

  const events = value.events.map((event) => validateEvent(event, now));
  const sessionIds = new Set(events.map((event) => event.session_id));
  const eventIds = new Set(events.map((event) => event.event_id));
  if (sessionIds.size !== 1) fail("MIXED_SESSION_BATCH");
  if (eventIds.size !== events.length) fail("DUPLICATE_EVENT_ID");
  return events;
}
