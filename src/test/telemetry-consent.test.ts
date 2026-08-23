/**
 * The analytics consent has to hold the collector, not just filter it at the
 * emission point.
 *
 * `startFrontendObservability()` runs in `main.tsx` before React mounts, and
 * `<FrontendRouteObserver />` sits outside `<AuthProvider>`, so events are
 * already queued before any profile — and therefore any consent — can be
 * known. An `if (consent)` check where events are recorded would leave the
 * initial page load, which is most of them, unprotected.
 *
 * Hence three states. The one that matters is `unknown`: it means *hold*, not
 * *drop*.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: () => getSession() } },
}));

import {
  getTelemetryConsent,
  recordFrontendError,
  setTelemetryConsent,
} from "@/lib/observability";

const fetchMock = vi.fn();

/** Lets the queued microtasks of a flush settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetchMock);
  getSession.mockResolvedValue({ data: { session: { access_token: "jwt" } } });
  setTelemetryConsent("unknown");
});

describe("telemetry consent gate", () => {
  it("starts out unresolved", () => {
    expect(getTelemetryConsent()).toBe("unknown");
  });

  it("holds events while consent is unresolved, then releases them", async () => {
    recordFrontendError("JAVASCRIPT_RUNTIME_ERROR");
    await settle();

    // This is the case the naive design missed: the event exists, the profile
    // has not arrived, and nothing may leave the browser yet.
    expect(fetchMock).not.toHaveBeenCalled();

    setTelemetryConsent("granted");
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("discards what was held when consent is refused", async () => {
    recordFrontendError("UNHANDLED_REJECTION");
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();

    setTelemetryConsent("denied");
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();

    // And granting later must not resurrect the events collected before the
    // refusal -- they were dropped, not parked.
    setTelemetryConsent("granted");
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("records nothing at all once consent is refused", async () => {
    setTelemetryConsent("denied");
    recordFrontendError("RESOURCE_LOAD_ERROR");
    await settle();

    setTelemetryConsent("granted");
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("goes back to holding on sign-out", async () => {
    setTelemetryConsent("granted");
    setTelemetryConsent("unknown");

    recordFrontendError("JAVASCRIPT_RUNTIME_ERROR");
    await settle();

    expect(getTelemetryConsent()).toBe("unknown");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
