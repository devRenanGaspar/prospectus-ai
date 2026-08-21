import { describe, expect, it, vi } from "vitest";
import {
  classifyRuntimeError,
  n8nCorrelation,
  N8N_ACTIONS,
  recordOperationalEvent,
  recordQueueMetric,
  safeAllowlistedValue,
  sanitizeAttributes,
  webhookCorrelation,
} from "../../supabase/functions/_shared/operational-telemetry";

const SEARCH_ID = "11111111-1111-4111-8111-111111111111";
const CORRELATION_ID = "22222222-2222-4222-8222-222222222222";

describe("operational telemetry helper", () => {
  it("keeps only allowlisted actions and attributes", () => {
    expect(safeAllowlistedValue("insert_leads", N8N_ACTIONS)).toBe("insert_leads");
    expect(safeAllowlistedValue("customer@example.com", N8N_ACTIONS)).toBe("unknown");

    expect(
      sanitizeAttributes({
        action: "poll",
        result_count: 3,
        email: "customer@example.com",
        payload: { secret: true },
        error: "raw provider error",
      }),
    ).toEqual({ action: "poll", result_count: 3 });
  });

  it("correlates paid webhook requests only through validated technical UUIDs", () => {
    expect(
      webhookCorrelation("find_leads", {
        search_id: SEARCH_ID,
        correlation_id: CORRELATION_ID,
      }),
    ).toEqual({
      correlationId: SEARCH_ID,
      requestId: SEARCH_ID,
    });
    expect(
      webhookCorrelation("copy_generation_requested", {
        copy_request_id: "customer@example.com",
      }),
    ).toEqual({ correlationId: null, requestId: null });
  });

  it("prefers an explicit validated n8n correlation ID", () => {
    expect(
      n8nCorrelation({
        correlation_id: CORRELATION_ID,
        search_id: SEARCH_ID,
      }),
    ).toEqual({ correlationId: CORRELATION_ID, requestId: SEARCH_ID });
  });

  it("classifies failures without copying exception messages", () => {
    expect(classifyRuntimeError({ code: "23505", message: "private value" })).toBe(
      "DATABASE_ERROR",
    );
    expect(classifyRuntimeError(new Error("customer@example.com"))).toBe(
      "INTERNAL_ERROR",
    );
  });

  it("writes a sanitized event and drops unsafe fields", async () => {
    // Typed signature, not `async () => ...`: the inferred parameter tuple of a
    // zero-arg mock is `[]`, so reading `mock.calls[0][1]` below is a type error.
    const rpc = vi.fn(
      async (_fn: string, _parameters: Record<string, unknown>) => ({ error: null }),
    );
    const client = { rpc };

    expect(
      await recordOperationalEvent(client, {
        eventName: "n8n.action_completed",
        source: "n8n",
        correlationId: SEARCH_ID,
        requestId: SEARCH_ID,
        durationMs: 12.7,
        attributes: {
          action: "insert_leads",
          result_count: 4,
          email: "customer@example.com",
          message: "private content",
        },
      }),
    ).toBe(true);

    expect(rpc).toHaveBeenCalledTimes(1);
    const parameters = rpc.mock.calls[0][1];
    expect(parameters._duration_ms).toBe(13);
    expect(parameters._attributes).toEqual({
      action: "insert_leads",
      result_count: 4,
    });
    expect(JSON.stringify(parameters)).not.toContain("customer@example.com");
    expect(JSON.stringify(parameters)).not.toContain("private content");
  });

  it("keeps telemetry failures best-effort", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const client = {
      rpc: vi.fn(async () => ({ error: { code: "PGRST202" } })),
    };

    expect(
      await recordQueueMetric(client, {
        queueName: "send_requests",
        queueDepth: 5,
        source: "edge",
      }),
    ).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(
      "[operational-telemetry] write_failed target=queue code=PGRST202",
    );
    errorSpy.mockRestore();
  });
});
