/**
 * `no-inert-controls.test.ts` covers the syntactic half of "a control that
 * does nothing": whether a handler is present and non-empty. It cannot
 * establish that a non-empty handler actually persists anything -- that is a
 * claim about behaviour, and this file is where it gets checked, by firing
 * the LGPD consent switches and asserting on what they write.
 *
 * The obvious rule, "fail any handler that only calls setState", was
 * considered and is wrong. Verified against this repository:
 * `OnboardingModal.tsx` has a Checkbox whose handler only calls
 * `setDontShowAgain`, with the write happening in `handleClose`; `AdminPlans`
 * has a Switch that only updates form state, persisted in `handleSave`. Both
 * are correct, and that rule would have failed them -- producing an exception
 * list that lets genuinely inert controls back through. A different
 * heuristic, the same defect.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";

const update = vi.fn();
const eq = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      update: (payload: unknown) => {
        update(table, payload);
        return { eq: (column: string, value: unknown) => eq(column, value) };
      },
      select: () => ({
        eq: () => ({
          order: () => ({ range: () => Promise.resolve({ data: [], error: null }) }),
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
          single: () => Promise.resolve({ data: null, error: null }),
        }),
        order: () => ({ range: () => Promise.resolve({ data: [], error: null }) }),
      }),
    }),
    functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
  },
}));

const refreshProfile = vi.fn();
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    profile: {
      id: "user-1",
      full_name: "Renan",
      lgpd_consents: { analytics: true, marketing: false },
      lgpd_consents_updated_at: null,
    },
    refreshProfile,
  }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/hooks/useWhatsApp", () => ({
  useWhatsApp: () => ({ status: null, isLoading: false, connect: vi.fn(), disconnect: vi.fn() }),
}));

vi.mock("@/hooks/useAccountDeletion", () => ({
  useRequestAccountDeletion: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

// Imported by Settings only after the C1 change lands. Mocking a module that
// is not imported is a no-op, so this file works either side of that merge.
vi.mock("@/hooks/usePlans", () => ({
  usePlans: () => ({ data: [], isLoading: false, isError: false }),
  useCurrentSubscription: () => ({ data: null, isLoading: false, isError: false }),
}));

import Settings from "@/pages/Settings";

function renderSettings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <HelmetProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/settings?tab=privacy"]}>
          <Settings />
        </MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>,
  );
}

beforeEach(() => {
  update.mockReset();
  eq.mockReset();
  eq.mockResolvedValue({ error: null });
  refreshProfile.mockReset();
  refreshProfile.mockResolvedValue(undefined);
});

describe("the LGPD consent switches write what they display", () => {
  it("persists the new value when the analytics switch is turned off", async () => {
    renderSettings();

    const analytics = await screen.findByRole("switch", {
      name: /Telemetria de uso dentro do aplicativo/i,
    });
    fireEvent.click(analytics);

    await waitFor(() => expect(update).toHaveBeenCalled());
    const [table, payload] = update.mock.calls[0] as [string, Record<string, unknown>];
    expect(table).toBe("profiles");
    expect((payload.lgpd_consents as Record<string, boolean>).analytics).toBe(false);
  });

  it("writes the consent timestamp with it", () => {
    // LGPD art. 8 §1 puts the burden of *demonstrating* consent on the
    // controller. A boolean with no timestamp demonstrates nothing, so the
    // column is part of the promise, not decoration.
    return (async () => {
      renderSettings();
      fireEvent.click(await screen.findByRole("switch", { name: /Telemetria de uso dentro do aplicativo/i }));
      await waitFor(() => expect(update).toHaveBeenCalled());
      const [, payload] = update.mock.calls[0] as [string, Record<string, unknown>];
      expect(payload.lgpd_consents_updated_at).toBeTruthy();
    })();
  });

  it("scopes the write to the signed-in user", async () => {
    renderSettings();
    fireEvent.click(await screen.findByRole("switch", { name: /Comunicações de marketing/i }));
    await waitFor(() => expect(eq).toHaveBeenCalledWith("id", "user-1"));
  });

  it("refreshes the profile, which is what makes the choice take effect", async () => {
    // The telemetry gate reads `lgpd_consents.analytics` off the profile. A
    // write that never reaches the context changes the database and not the
    // behaviour -- inert in the way that matters, with a successful write to
    // point at.
    renderSettings();
    fireEvent.click(await screen.findByRole("switch", { name: /Telemetria de uso dentro do aplicativo/i }));
    await waitFor(() => expect(refreshProfile).toHaveBeenCalled());
  });
});
