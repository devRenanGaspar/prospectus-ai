/**
 * Tests for the account deletion request flow.
 *
 * These exist because of a real defect: the "Solicitar exclusão de conta"
 * handler in Settings.tsx fired a success toast and closed the dialog without
 * making any call at all — no RPC, no table write, no email — while the dialog
 * promised permanent erasure of all data within 30 business days. The user was
 * told their LGPD request had been received; nothing had been recorded, so
 * nothing could be honoured.
 *
 * The REGRESSION tests below are the ones that matter: they fail if anyone
 * reintroduces a success path that does not reach the server.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rpc = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}));

import { useRequestAccountDeletion } from "@/hooks/useAccountDeletion";

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

const okResult = {
  success: true,
  created: true,
  request_id: "req-1",
  requested_at: "2026-08-17T12:00:00Z",
  due_at: "2026-09-16T12:00:00Z",
};

beforeEach(() => {
  rpc.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
});

describe("useRequestAccountDeletion", () => {
  it("records the request through the server RPC", async () => {
    rpc.mockResolvedValue({ data: okResult, error: null });

    const { result } = renderHook(() => useRequestAccountDeletion(), { wrapper });
    await result.current.mutateAsync();

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe("request_account_deletion");
  });

  it("reports an already-open request instead of creating a second one", async () => {
    rpc.mockResolvedValue({ data: { ...okResult, created: false }, error: null });

    const { result } = renderHook(() => useRequestAccountDeletion(), { wrapper });
    const out = await result.current.mutateAsync();

    expect(out.created).toBe(false);
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(String(toastSuccess.mock.calls[0][0])).toContain("já tem uma solicitação");
  });

  // REGRESSION: the original bug. A failure must never look like a success.
  it("does not report success when the RPC errors", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });

    const { result } = renderHook(() => useRequestAccountDeletion(), { wrapper });
    await expect(result.current.mutateAsync()).rejects.toBeTruthy();

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  // REGRESSION: a server response that is not an explicit success must also fail.
  it("does not report success when the RPC returns no success flag", async () => {
    rpc.mockResolvedValue({ data: { success: false }, error: null });

    const { result } = renderHook(() => useRequestAccountDeletion(), { wrapper });
    await expect(result.current.mutateAsync()).rejects.toBeTruthy();

    expect(toastSuccess).not.toHaveBeenCalled();
  });

  // REGRESSION: the deleted behaviour was a toast with no network call at all.
  it("never reports success without calling the server", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "offline" } });

    const { result } = renderHook(() => useRequestAccountDeletion(), { wrapper });
    await expect(result.current.mutateAsync()).rejects.toBeTruthy();

    expect(toastSuccess).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
