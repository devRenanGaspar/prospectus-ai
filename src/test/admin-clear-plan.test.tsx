/**
 * useUpdateUser must send an explicit "clear the plan" intent, not a bare
 * `_plan_id: null`. The RPC used to coalesce a NULL _plan_id back onto the
 * existing column, so the admin panel's "Nenhum (Trial)" option produced a
 * success toast and left the plan unchanged for any user who had one.
 *
 * This test only checks the payload the hook builds -- the property that the
 * database actually clears the column on `_clear_plan => true` is asserted
 * by supabase/tests/admin_rpc_contract.sql, which is the only place that can
 * see it. Fails against the pre-fix hook, which sent `_plan_id: null` and no
 * `_clear_plan` field at all.
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rpc = vi.fn().mockResolvedValue({ data: null, error: null });

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { useUpdateUser } from "@/hooks/useAdmin";

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

describe("useUpdateUser: clearing a plan sends an explicit intent", () => {
  it("plan_id: null sends _clear_plan: true, not a bare null", async () => {
    const { result } = renderHook(() => useUpdateUser(), { wrapper });

    act(() => {
      result.current.mutate({ id: "user-1", plan_id: null });
    });

    await waitFor(() => expect(rpc).toHaveBeenCalled());

    const [, payload] = rpc.mock.calls[0];
    expect(payload._clear_plan).toBe(true);
  });

  it("omitting plan_id does not send _clear_plan: true", async () => {
    rpc.mockClear();
    const { result } = renderHook(() => useUpdateUser(), { wrapper });

    act(() => {
      result.current.mutate({ id: "user-1", full_name: "New Name" });
    });

    await waitFor(() => expect(rpc).toHaveBeenCalled());

    const [, payload] = rpc.mock.calls[0];
    expect(payload._clear_plan).toBe(false);
    expect(payload._plan_id).toBeUndefined();
  });

  it("setting a real plan_id passes it through unchanged", async () => {
    rpc.mockClear();
    const { result } = renderHook(() => useUpdateUser(), { wrapper });

    act(() => {
      result.current.mutate({ id: "user-1", plan_id: "35bb2a71-6fe1-459e-85a7-541fd8898051" });
    });

    await waitFor(() => expect(rpc).toHaveBeenCalled());

    const [, payload] = rpc.mock.calls[0];
    expect(payload._clear_plan).toBe(false);
    expect(payload._plan_id).toBe("35bb2a71-6fe1-459e-85a7-541fd8898051");
  });
});
