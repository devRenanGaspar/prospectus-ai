/**
 * `Privacy.tsx` §7.3 promises "nada é enviado enquanto a sua escolha não
 * estiver carregada" -- so `TelemetryConsentGate` must treat every
 * unresolved `profileStatus` as unresolved, not just `"loading"`. The status
 * type has a third member, `"error"`, which `AuthContext` sets on two
 * failure paths; if the gate only checked for `"loading"`, an `"error"`
 * state would fall through to granted, measuring a user who had switched
 * telemetry off.
 *
 * `telemetry-consent.test.ts` exercises `unknown`/`granted`/`denied` directly
 * against `setTelemetryConsent`. This file is separate because that
 * property lives one level up, in which of the three states the gate
 * decides to pass it -- a test of the consent library alone cannot see it.
 *
 * These render the gate.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type Status = "loading" | "resolved" | "error";

let mockAuth: {
  user: { id: string } | null;
  profile: { lgpd_consents?: { analytics?: boolean } } | null;
  profileStatus: Status;
  loading: boolean;
};

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockAuth,
}));

const setTelemetryConsent = vi.fn();
vi.mock("@/lib/observability", () => ({
  setTelemetryConsent: (value: string) => setTelemetryConsent(value),
}));

import TelemetryConsentGate from "@/components/TelemetryConsentGate";

beforeEach(() => {
  setTelemetryConsent.mockReset();
});

function renderWith(auth: typeof mockAuth) {
  mockAuth = auth;
  render(<TelemetryConsentGate />);
  return setTelemetryConsent.mock.calls.at(-1)?.[0];
}

const SIGNED_IN = { id: "u1" };

describe("TelemetryConsentGate resolves consent", () => {
  it("holds the queue while the session is loading", () => {
    expect(
      renderWith({ user: null, profile: null, profileStatus: "loading", loading: true }),
    ).toBe("unknown");
  });

  it("holds the queue while the profile is still loading", () => {
    expect(
      renderWith({ user: SIGNED_IN, profile: null, profileStatus: "loading", loading: false }),
    ).toBe("unknown");
  });

  it("holds the queue when the profile failed to load", () => {
    // The defect. Before the fix this returned "granted", and a user who had
    // turned telemetry off was measured on every profile failure.
    expect(
      renderWith({ user: SIGNED_IN, profile: null, profileStatus: "error", loading: false }),
    ).toBe("unknown");
  });

  it("does not discard the queue on failure, so a later resolve can flush it", () => {
    // "denied" would also satisfy the policy sentence, and would be wrong:
    // it drops events belonging to users who never refused. The distinction
    // is the whole reason the consent type has three states.
    expect(
      renderWith({ user: SIGNED_IN, profile: null, profileStatus: "error", loading: false }),
    ).not.toBe("denied");
  });

  it("denies when the profile says analytics is off", () => {
    expect(
      renderWith({
        user: SIGNED_IN,
        profile: { lgpd_consents: { analytics: false } },
        profileStatus: "resolved",
        loading: false,
      }),
    ).toBe("denied");
  });

  it("grants when the profile resolved and never answered the key", () => {
    expect(
      renderWith({ user: SIGNED_IN, profile: {}, profileStatus: "resolved", loading: false }),
    ).toBe("granted");
  });

  it("grants for an anonymous visitor, which is what the policy discloses", () => {
    expect(
      renderWith({ user: null, profile: null, profileStatus: "loading", loading: false }),
    ).toBe("granted");
  });
});

describe("the gate decides from the one status that permits a decision", () => {
  // The original bug was shaped by an enumeration: "loading" holds, everything
  // else decides. A fourth ProfileStatus added later would inherit the same
  // defect verbatim. Asserting the inverted form is the only version of this
  // test that survives someone adding a status.
  const SOURCE = readFileSync(
    resolve(__dirname, "../components/TelemetryConsentGate.tsx"),
    "utf8",
  );
  const NEWLINE = String.fromCharCode(10);
  const code = SOURCE.split(NEWLINE)
    .filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("//"))
    .join(NEWLINE);

  it("branches on `!== \"resolved\"`, not on a list of unresolved statuses", () => {
    expect(code).toContain('profileStatus !== "resolved"');
    expect(code).not.toContain('profileStatus === "loading"');
  });

  it("still handles every member of ProfileStatus", () => {
    // Guards the guard: if the union grew and the gate kept compiling, the
    // assertion above would be checking a shape that no longer covers it.
    const context = readFileSync(resolve(__dirname, "../contexts/AuthContext.tsx"), "utf8");
    const union = context.match(/export type ProfileStatus = ([^;]+);/)?.[1] ?? "";
    const members = [...union.matchAll(/"([a-z]+)"/g)].map((m) => m[1]).sort();
    expect(members).toEqual(["error", "loading", "resolved"]);
  });
});

describe("the privacy policy sentence this gate is accountable to", () => {
  // The C1 gate, scoped on purpose. It does not try to verify prose in
  // general -- that produces a test which fails for the wrong reasons. It
  // pins one named claim to the code that makes it true, so that editing
  // either side alone breaks the build.
  const POLICY = readFileSync(resolve(__dirname, "../pages/Privacy.tsx"), "utf8");

  it("still promises that nothing is sent before the choice is loaded", () => {
    expect(POLICY).toContain("nada é enviado enquanto a sua escolha não estiver carregada");
  });
});
