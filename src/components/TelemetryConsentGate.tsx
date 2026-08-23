import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { setTelemetryConsent } from "@/lib/observability";

/**
 * Resolves the analytics consent for the frontend telemetry collector.
 *
 * Renders nothing. It exists as a component because it has to sit **inside**
 * `<AuthProvider>`: the collector itself starts in `main.tsx` before React
 * mounts, and `<FrontendRouteObserver />` is deliberately outside the provider,
 * so neither can read a profile. Until this resolves, the collector holds its
 * queue instead of sending — see `setTelemetryConsent`.
 *
 * The mapping:
 *
 * - still loading the session, or the profile has not come back yet → leave it
 *   `unknown`, so nothing is sent during the window where we cannot know
 * - signed out → `granted`. An anonymous visitor has no consent record to
 *   read, and the public pages' measurement is what the privacy policy
 *   discloses in section 7. The Settings switch is scoped to the app, and its
 *   label says so
 * - signed in → whatever the profile says, defaulting to granted when the key
 *   was never answered, which is the same thing the policy discloses
 * - profile failed to load → `unknown`, so the queue is held rather than sent
 *
 * That last line used to read `granted`, "matching the signed-out default
 * rather than silently blacking out telemetry on an unrelated failure". The
 * reasoning was coherent and the policy said the opposite: Privacy.tsx §7.3
 * promises that "nada é enviado enquanto a sua escolha não estiver carregada",
 * and a failed profile load is precisely the state where the choice has not
 * been loaded. A user who had switched telemetry **off** was measured every
 * time their profile failed.
 *
 * `unknown` and not `denied`: `unknown` holds the queue, so if the profile
 * resolves on a later render the buffered events flush with the real consent.
 * `denied` would discard events belonging to users who never refused. The
 * buffer is bounded at MAX_EVENTS_PER_PAGE (60) in observability.ts, so
 * holding it indefinitely costs a fixed, small amount of memory and never
 * grows.
 *
 * The cost is telemetry lost during a profile outage. For a privacy promise
 * that is the correct side to err on — and the promise is the part that a
 * reader can check.
 */
export default function TelemetryConsentGate() {
  const { user, profile, profileStatus, loading } = useAuth();

  useEffect(() => {
    if (loading) {
      setTelemetryConsent("unknown");
      return;
    }
    if (!user) {
      setTelemetryConsent("granted");
      return;
    }
    if (profileStatus !== "resolved") {
      // Both "loading" and "error". Written as a check against the one status
      // that permits a decision, rather than a list of the ones that do not:
      // a fourth status added later defaults to holding the queue, which is
      // the safe direction. The list form is how "error" came to fall through
      // to granted in the first place.
      setTelemetryConsent("unknown");
      return;
    }
    const analytics = profile?.lgpd_consents?.analytics;
    setTelemetryConsent(analytics === false ? "denied" : "granted");
  }, [user, profile, profileStatus, loading]);

  return null;
}
