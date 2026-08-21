const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;

const SAFE_ATTRIBUTE_KEYS = new Set([
  "action",
  "attempt",
  "batch_size",
  "http_status",
  "oldest_age_seconds",
  "operation_stage",
  "provider",
  "queue_depth",
  "queue_name",
  "result_count",
  "status_from",
  "status_to",
]);

export const WEBHOOK_EVENT_TYPES = new Set([
  "lead_created",
  "lead_status_changed",
  "message_received",
  "message_sent",
  "message_send_requested",
  "copy_generation_requested",
  "meeting_scheduled",
  "credits_debited",
  "find_leads",
  "prompt_validation",
  "agent_toggle",
  "whatsapp",
]);

export const WEBHOOK_ACTIONS = new Set([
  "connect_whatsapp",
  "disconnect_whatsapp",
  "generate",
  "get_status",
  "off",
  "on",
  "restore_default",
  "search",
  "send",
  "validate",
]);

export const N8N_ACTIONS = new Set([
  "add_credits",
  "deduct_credits",
  "deduct_credits_bulk",
  "get_calendar_access_token",
  "get_lead_by_google_place_id",
  "get_lead_by_phone",
  "get_lead_comments",
  "get_queue_status",
  "get_user_context",
  "get_user_credits",
  "insert_lead_comments",
  "insert_leads",
  "insert_message",
  "pool_summary_by_category",
  "promote_reserve_to_pool",
  "query_leads",
  "renew_subscription",
  "set_lead_owner",
  "set_user_access",
  "update_copy_request_status",
  "update_lead",
  "update_lead_status",
  "update_prompts",
  "update_search_status",
  "update_send_request_status",
  "update_whatsapp",
]);

type Scalar = string | number | boolean | null;

function isScalar(value: unknown): value is Scalar {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

interface RpcError {
  code?: string;
}

export interface TelemetryRpcClient {
  rpc(
    functionName: string,
    parameters: Record<string, unknown>,
  ): PromiseLike<{ error: RpcError | null }>;
}

export interface CorrelationContext {
  correlationId: string | null;
  requestId: string | null;
}

export interface OperationalEventInput {
  eventName: string;
  source: "edge" | "n8n" | "scheduler";
  occurredAt?: string;
  correlationId?: string | null;
  requestId?: string | null;
  operationType?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  status?: string | null;
  durationMs?: number | null;
  errorCode?: string | null;
  attributes?: Record<string, unknown>;
}

export interface OperationRunInput {
  correlationId: string;
  operationType:
    | "find_leads"
    | "generate_copy"
    | "send_message"
    | "webhook_dispatch"
    | "email_delivery";
  status:
    | "accepted"
    | "queued"
    | "dispatched"
    | "processing"
    | "completed"
    | "failed"
    | "timed_out"
    | "cancelled";
  source: "edge" | "n8n" | "scheduler";
  occurredAt?: string;
  requestId?: string | null;
  attemptIncrement?: boolean;
  errorCode?: string | null;
  attributes?: Record<string, unknown>;
}

export interface QueueMetricInput {
  queueName:
    | "lead_searches"
    | "copy_requests"
    | "send_requests"
    | "auth_emails"
    | "transactional_emails"
    | "auth_emails_dlq"
    | "transactional_emails_dlq";
  queueDepth: number;
  source: "edge" | "n8n" | "scheduler";
  capturedAt?: string;
  oldestAgeSeconds?: number | null;
  processingCount?: number;
  failedCount?: number;
  correlationId?: string | null;
  attributes?: Record<string, unknown>;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function safeAllowlistedValue(value: unknown, allowed: Set<string>) {
  return typeof value === "string" && allowed.has(value) ? value : "unknown";
}

export function sanitizeAttributes(input: Record<string, unknown> = {}) {
  const output: Record<string, Scalar> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!SAFE_ATTRIBUTE_KEYS.has(key)) continue;
    if (!isScalar(value)) continue;
    if (typeof value === "string" && value.length > 128) continue;
    if (typeof value === "number" && !Number.isFinite(value)) continue;
    output[key] = value;
  }
  return output;
}

export function sanitizeErrorCode(value: unknown, fallback = "INTERNAL_ERROR") {
  return typeof value === "string" && ERROR_CODE_PATTERN.test(value)
    ? value
    : fallback;
}

export function classifyRuntimeError(error: unknown, fallback = "INTERNAL_ERROR") {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "UPSTREAM_TIMEOUT";
  }
  if (error && typeof error === "object") {
    const candidate = error as { code?: unknown; status?: unknown };
    if (candidate.status === 429) return "RATE_LIMITED";
    if (typeof candidate.code === "string" && candidate.code.length > 0) {
      return fallback === "INTERNAL_ERROR" || fallback === "DATABASE_ERROR"
        ? "DATABASE_ERROR"
        : sanitizeErrorCode(fallback);
    }
  }
  return sanitizeErrorCode(fallback);
}

export function webhookCorrelation(
  eventType: unknown,
  payload: unknown,
): CorrelationContext {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { correlationId: null, requestId: null };
  }

  const record = payload as Record<string, unknown>;
  const requestCandidate =
    eventType === "find_leads"
      ? record.search_id
      : eventType === "copy_generation_requested"
        ? record.copy_request_id
        : record.send_request_id;
  const requestId = isUuid(requestCandidate) ? requestCandidate : null;
  const explicitCorrelation = isUuid(record.correlation_id)
    ? record.correlation_id
    : null;
  return {
    correlationId: requestId ?? explicitCorrelation,
    requestId,
  };
}

export function n8nCorrelation(body: unknown): CorrelationContext {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { correlationId: null, requestId: null };
  }
  const record = body as Record<string, unknown>;
  const explicitCorrelation = isUuid(record.correlation_id)
    ? record.correlation_id
    : null;
  const requestCandidate = [
    record.request_id,
    record.search_id,
    record.copy_request_id,
    record.send_request_id,
  ].find(isUuid);
  const requestId = requestCandidate ?? null;
  return {
    correlationId: explicitCorrelation ?? requestId,
    requestId,
  };
}

export function resultCount(result: unknown) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const record = result as Record<string, unknown>;
  for (const key of ["count", "updated", "inserted", "processed"]) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return Math.floor(value);
    }
  }
  return null;
}

function nonnegativeInteger(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : fallback;
}

async function writeTelemetry(
  client: TelemetryRpcClient,
  functionName: string,
  parameters: Record<string, unknown>,
  target: string,
) {
  try {
    const { error } = await client.rpc(functionName, parameters);
    if (error) {
      console.error(
        `[operational-telemetry] write_failed target=${target} code=${sanitizeErrorCode(error.code, "RPC_ERROR")}`,
      );
      return false;
    }
    return true;
  } catch {
    console.error(`[operational-telemetry] write_failed target=${target} code=RPC_EXCEPTION`);
    return false;
  }
}

export function recordOperationalEvent(
  client: TelemetryRpcClient,
  input: OperationalEventInput,
) {
  return writeTelemetry(
    client,
    "record_operational_event",
    {
      _event_name: input.eventName,
      _source: input.source,
      _event_id: crypto.randomUUID(),
      _occurred_at: input.occurredAt ?? new Date().toISOString(),
      _correlation_id: isUuid(input.correlationId) ? input.correlationId : null,
      _request_id: isUuid(input.requestId) ? input.requestId : null,
      _session_id: null,
      _operation_type: input.operationType ?? null,
      _entity_type: input.entityType ?? null,
      _entity_id: isUuid(input.entityId) ? input.entityId : null,
      _status: input.status ?? null,
      _route_key: null,
      _duration_ms:
        typeof input.durationMs === "number" && Number.isFinite(input.durationMs)
          ? Math.max(0, Math.round(input.durationMs))
          : null,
      _error_code: input.errorCode
        ? sanitizeErrorCode(input.errorCode)
        : null,
      _attributes: sanitizeAttributes(input.attributes),
    },
    "event",
  );
}

export function recordOperationRun(
  client: TelemetryRpcClient,
  input: OperationRunInput,
) {
  return writeTelemetry(
    client,
    "record_operation_run",
    {
      _correlation_id: input.correlationId,
      _operation_type: input.operationType,
      _status: input.status,
      _source: input.source,
      _occurred_at: input.occurredAt ?? new Date().toISOString(),
      _request_id: isUuid(input.requestId) ? input.requestId : null,
      _session_id: null,
      _attempt_increment: input.attemptIncrement ?? false,
      _error_code: input.errorCode
        ? sanitizeErrorCode(input.errorCode)
        : null,
      _attributes: sanitizeAttributes(input.attributes),
    },
    "operation",
  );
}

export function recordQueueMetric(
  client: TelemetryRpcClient,
  input: QueueMetricInput,
) {
  return writeTelemetry(
    client,
    "record_queue_metric",
    {
      _queue_name: input.queueName,
      _queue_depth: nonnegativeInteger(input.queueDepth),
      _source: input.source,
      _captured_at: input.capturedAt ?? new Date().toISOString(),
      _oldest_age_seconds:
        typeof input.oldestAgeSeconds === "number" && Number.isFinite(input.oldestAgeSeconds)
          ? nonnegativeInteger(input.oldestAgeSeconds)
          : null,
      _processing_count: nonnegativeInteger(input.processingCount),
      _failed_count: nonnegativeInteger(input.failedCount),
      _correlation_id: isUuid(input.correlationId) ? input.correlationId : null,
      _attributes: sanitizeAttributes(input.attributes),
    },
    "queue",
  );
}
