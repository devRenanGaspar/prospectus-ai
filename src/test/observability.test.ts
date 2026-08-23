import { describe, expect, it, vi } from "vitest";
import {
  createWebVitalEvent,
  FrontendTelemetryBuffer,
  sanitizeRouteKey,
  type FrontendTelemetryEvent,
} from "@/lib/observability";
import {
  parseFrontendTelemetryPayload,
  TelemetryValidationError,
} from "../../supabase/functions/_shared/frontend-telemetry";

const NOW = new Date("2026-08-05T20:00:00.000Z");
const SESSION_ID = "11111111-1111-4111-8111-111111111111";

function navigationEvent(
  eventId = "22222222-2222-4222-8222-222222222222",
): FrontendTelemetryEvent {
  return {
    event_id: eventId,
    event_name: "frontend.navigation",
    occurred_at: NOW.toISOString(),
    session_id: SESSION_ID,
    route_key: "/dashboard",
    attributes: {
      sample_rate: 1,
      connection_type: "4g",
      visibility_state: "visible",
      navigation_type: "navigate",
    },
  };
}

describe("frontend observability", () => {
  it("maps dynamic and unknown paths without retaining identifiers or queries", () => {
    expect(sanitizeRouteKey("/leads/private-id?token=secret")).toBe("/leads/:leadId");
    expect(sanitizeRouteKey("/unknown/customer@example.com")).toBe("/not-found");
    expect(sanitizeRouteKey("/dashboard/")).toBe("/dashboard");
  });

  it("stores duration metrics in milliseconds and keeps CLS categorical", () => {
    const context = {
      sessionId: SESSION_ID,
      routeKey: "/dashboard",
      sampleRate: 1,
      connectionType: "4g",
      visibilityState: "visible",
    };
    const lcp = createWebVitalEvent(
      { name: "LCP", value: 1234.6, rating: "good", navigationType: "navigate" },
      context,
    );
    const cls = createWebVitalEvent(
      { name: "CLS", value: 0.12, rating: "needs-improvement", navigationType: "navigate" },
      context,
    );

    expect(lcp.duration_ms).toBe(1235);
    expect(cls.duration_ms).toBeUndefined();
    expect(cls.attributes).not.toHaveProperty("value");
  });

  it("batches, retries and removes accepted events", async () => {
    const transport = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const buffer = new FrontendTelemetryBuffer(transport, {
      maxEvents: 2,
      maxBatchSize: 1,
      maxRetries: 2,
    });

    expect(buffer.enqueue(navigationEvent())).toBe(true);
    expect(buffer.enqueue(navigationEvent("33333333-3333-4333-8333-333333333333"))).toBe(true);
    expect(buffer.enqueue(navigationEvent("44444444-4444-4444-8444-444444444444"))).toBe(false);
    expect(await buffer.flush()).toBe(false);
    expect(buffer.pendingCount).toBe(2);
    expect(await buffer.flush()).toBe(true);
    expect(buffer.pendingCount).toBe(1);
  });
});

describe("frontend telemetry ingestion contract", () => {
  it("accepts a minimal safe batch", () => {
    const events = parseFrontendTelemetryPayload({ events: [navigationEvent()] }, NOW);
    expect(events).toHaveLength(1);
    expect(events[0].route_key).toBe("/dashboard");
  });

  it.each([
    ["PII attribute", { ...navigationEvent(), attributes: { ...navigationEvent().attributes, email: "x@y.test" } }],
    ["raw route", { ...navigationEvent(), route_key: "/leads/private-id" }],
    ["unexpected payload field", { ...navigationEvent(), message: "raw exception" }],
  ])("rejects %s", (_label, event) => {
    expect(() => parseFrontendTelemetryPayload({ events: [event] }, NOW)).toThrow(
      TelemetryValidationError,
    );
  });

  it("rejects mixed sessions and duplicate event identifiers", () => {
    const second = navigationEvent("33333333-3333-4333-8333-333333333333");
    second.session_id = "44444444-4444-4444-8444-444444444444";
    expect(() =>
      parseFrontendTelemetryPayload({ events: [navigationEvent(), second] }, NOW),
    ).toThrowError("MIXED_SESSION_BATCH");

    expect(() =>
      parseFrontendTelemetryPayload(
        { events: [navigationEvent(), navigationEvent()] },
        NOW,
      ),
    ).toThrowError("DUPLICATE_EVENT_ID");
  });

  it("rejects a numeric CLS value disguised as a duration", () => {
    const event = createWebVitalEvent(
      { name: "CLS", value: 0.1, rating: "good", navigationType: "navigate" },
      {
        sessionId: SESSION_ID,
        routeKey: "/dashboard",
        sampleRate: 1,
        connectionType: "4g",
        visibilityState: "visible",
      },
    );
    event.occurred_at = NOW.toISOString();
    event.duration_ms = 100;

    expect(() => parseFrontendTelemetryPayload({ events: [event] }, NOW)).toThrowError(
      "CLS_MUST_NOT_USE_DURATION",
    );
  });
});
