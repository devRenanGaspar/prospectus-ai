/**
 * Tests for the flows that spend credit.
 *
 * These tests exist because of a real bug: the debit was done on the client
 * and the status transition was a separate call, so a lead could be sent
 * straight to SEND_PENDING/COPY_PENDING without paying. The fix was moving
 * everything to atomic RPCs (request_send / request_copy / request_find_leads).
 *
 * Beyond the happy path, this has REGRESSION tests: if anyone goes back to
 * calling deduct_credits_bulk or updating status directly, these tests break.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rpc = vi.fn();
const invoke = vi.fn();
const from = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
    from: (...args: unknown[]) => from(...args),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("@/hooks/useAgencyContext", () => ({
  useAgencyContext: () => ({
    data: {
      name: "Agência X",
      business_type: "trafego_pago",
      full_name: "Renan",
      owner_name: "Renan",
      sdr_name: "MarIA",
      context_persona: "p",
      context_icp: {},
      context_qualification: {},
    },
  }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { useRequestSend } from "@/hooks/useSendRequest";
import { useRequestCopy } from "@/hooks/useCopyRequest";
import { useFindNewLeads, useUpdateLeadStatus } from "@/hooks/useLeads";

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

/** Names of the RPCs actually called. */
const calledRpcs = () => rpc.mock.calls.map((c) => c[0] as string);

beforeEach(() => {
  rpc.mockReset();
  invoke.mockReset();
  from.mockReset();
  vi.stubGlobal("crypto", { randomUUID: () => "req-fixed" });
  invoke.mockResolvedValue({ data: {}, error: null });
});

describe("useRequestSend", () => {
  it("charges and enqueues in a single atomic RPC", async () => {
    rpc.mockResolvedValue({ data: { success: true, charged: 2, cost: 2 }, error: null });

    const { result } = renderHook(() => useRequestSend(), { wrapper });
    const out = await result.current.mutateAsync(["lead-a", "lead-b"]);

    expect(rpc).toHaveBeenCalledWith("request_send", {
      _lead_ids: ["lead-a", "lead-b"],
      _request_id: "req-fixed",
    });
    expect(out).toEqual({ count: 2, cost: 2 });
  });

  it("REGRESSION: does not use deduct_credits_bulk or a direct status update", async () => {
    rpc.mockResolvedValue({ data: { success: true, charged: 1, cost: 1 }, error: null });

    const { result } = renderHook(() => useRequestSend(), { wrapper });
    await result.current.mutateAsync(["lead-a"]);

    expect(calledRpcs()).not.toContain("deduct_credits_bulk");
    // no direct table write: status changes happen inside the RPC
    expect(from).not.toHaveBeenCalled();
  });

  it("propagates INSUFFICIENT_CREDITS raised by the RPC", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "INSUFFICIENT_CREDITS" } });

    const { result } = renderHook(() => useRequestSend(), { wrapper });
    await expect(result.current.mutateAsync(["lead-a"])).rejects.toMatchObject({
      message: "INSUFFICIENT_CREDITS",
    });
  });

  it("does not fire anything when the lead list is empty", async () => {
    const { result } = renderHook(() => useRequestSend(), { wrapper });
    await expect(result.current.mutateAsync([])).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("useRequestCopy", () => {
  it("only sends the webhook the leads the RPC actually charged for", async () => {
    // asked for 2, the RPC charged for 1 (the other was already COPY_PENDING)
    rpc.mockResolvedValue({
      data: { success: true, charged: 1, cost: 3, lead_ids: ["lead-a"] },
      error: null,
    });

    const { result } = renderHook(() => useRequestCopy(), { wrapper });
    const out = await result.current.mutateAsync(["lead-a", "lead-b"]);

    expect(rpc).toHaveBeenCalledWith("request_copy", {
      _lead_ids: ["lead-a", "lead-b"],
      _request_id: "req-fixed",
    });
    expect(out).toEqual({ count: 1, cost: 3 });

    const body = invoke.mock.calls[0][1].body;
    expect(body.type).toBe("copy_generation_requested");
    expect(body.payload.lead_ids).toEqual(["lead-a"]);
    expect(body.payload.copy_request_id).toBe("req-fixed");
  });

  it("REGRESSION: does not send user_id in the payload (the proxy injects the authenticated one)", async () => {
    rpc.mockResolvedValue({ data: { success: true, charged: 1, cost: 3, lead_ids: ["a"] }, error: null });

    const { result } = renderHook(() => useRequestCopy(), { wrapper });
    await result.current.mutateAsync(["a"]);

    expect(invoke.mock.calls[0][1].body.payload).not.toHaveProperty("user_id");
    expect(calledRpcs()).not.toContain("deduct_credits_bulk");
  });

  it("propagates COPY_IN_PROGRESS (an expiring lock, raised by the RPC)", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "COPY_IN_PROGRESS" } });

    const { result } = renderHook(() => useRequestCopy(), { wrapper });
    await expect(result.current.mutateAsync(["a"])).rejects.toMatchObject({
      message: "COPY_IN_PROGRESS",
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  // REGRESSION: invoke() resolves { data: null, error } for HTTP/relay/network
  // failures rather than rejecting (verified against @supabase/functions-js's
  // source) -- a .catch()-only handler here never fires for those, so a
  // failed webhook used to charge credits and leave the leads in
  // COPY_PENDING with nothing to notice or refund it. This test mocks invoke
  // the way the real SDK actually behaves: resolved, not rejected.
  it("REGRESSION: refunds via fail_copy_request when invoke() resolves with an error", async () => {
    rpc.mockImplementation((fn: string) => {
      if (fn === "request_copy") {
        return Promise.resolve({
          data: { success: true, charged: 1, cost: 5, lead_ids: ["a"] },
          error: null,
        });
      }
      if (fn === "fail_copy_request") {
        return Promise.resolve({ data: { success: true, refunded: 5 }, error: null });
      }
      throw new Error(`unexpected rpc call: ${fn}`);
    });
    invoke.mockResolvedValue({ data: null, error: { message: "webhook unreachable" } });

    const { result } = renderHook(() => useRequestCopy(), { wrapper });
    await result.current.mutateAsync(["a"]);

    await waitFor(() => expect(calledRpcs()).toContain("fail_copy_request"));
    expect(rpc).toHaveBeenCalledWith("fail_copy_request", { _request_id: "req-fixed" });
  });
});

describe("useFindNewLeads", () => {
  const params = {
    quantity: 10,
    limitPerNiche: 2,
    requireWebsite: true,
    requireInstagram: false,
  };

  it("charges and creates the search in a single atomic RPC", async () => {
    rpc.mockResolvedValue({ data: { success: true, charged: 10, cost: 10 }, error: null });

    const { result } = renderHook(() => useFindNewLeads(), { wrapper });
    await result.current.mutateAsync(params);

    expect(rpc).toHaveBeenCalledWith("request_find_leads", {
      _quantity: 10,
      _limit_per_niche: 2,
      _request_id: "req-fixed",
      _require_website: true,
      _require_instagram: false,
    });
    expect(calledRpcs()).not.toContain("deduct_credits_bulk");

    const body = invoke.mock.calls[0][1].body;
    expect(body.type).toBe("find_leads");
    expect(body.payload.search_id).toBe("req-fixed");
    expect(body.payload).not.toHaveProperty("user_id");
  });

  it("calls fail_search if the webhook fails (and does not update status directly)", async () => {
    rpc.mockResolvedValue({ data: { success: true, charged: 10, cost: 10 }, error: null });
    invoke.mockRejectedValue(new Error("n8n fora do ar"));

    const { result } = renderHook(() => useFindNewLeads(), { wrapper });
    await result.current.mutateAsync(params);

    await waitFor(() => {
      expect(rpc).toHaveBeenCalledWith("fail_search", { _search_id: "req-fixed" });
    });
    // the direct UPDATE on lead_searches.status was locked out in the database
    expect(from).not.toHaveBeenCalled();
  });

  it("propagates SEARCH_IN_PROGRESS", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "SEARCH_IN_PROGRESS" } });

    const { result } = renderHook(() => useFindNewLeads(), { wrapper });
    await expect(result.current.mutateAsync(params)).rejects.toMatchObject({
      message: "SEARCH_IN_PROGRESS",
    });
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("useUpdateLeadStatus", () => {
  it.each(["COPY_PENDING", "SEND_PENDING"] as const)(
    "refuses a direct transition to %s (must go through the paid RPC)",
    async (status) => {
      const { result } = renderHook(() => useUpdateLeadStatus(), { wrapper });
      await expect(result.current.mutateAsync({ leadId: "lead-a", status })).rejects.toMatchObject({
        message: "INVALID_DIRECT_TRANSITION",
      });
      expect(from).not.toHaveBeenCalled();
    },
  );

  it("allows a transition that does not cost credit", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    from.mockReturnValue({ update });

    const { result } = renderHook(() => useUpdateLeadStatus(), { wrapper });
    await result.current.mutateAsync({ leadId: "lead-a", status: "CLOSED_WON" });

    expect(from).toHaveBeenCalledWith("leads");
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: "CLOSED_WON" }));
  });
});
