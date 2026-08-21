/**
 * Tests for the "error discarded" class: a real failure that the user sees as
 * success.
 *
 * All of these mock `functions.invoke` the way the SDK actually behaves --
 * **resolved** with `{ data: null, error }` for HTTP, relay and network
 * failures, not rejected. That distinction is the whole bug: the call sites
 * had `.catch()` handlers that could never fire for the failures that happen
 * in production.
 *
 * Each test below fails against the pre-fix code. That was verified by running
 * this file against the previous revision, not assumed.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rpc = vi.fn();
const invoke = vi.fn();
const from = vi.fn();
const toastError = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
    from: (...args: unknown[]) => from(...args),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" }, profile: { whatsapp_number: "5511900000000" } }),
}));

vi.mock("@/hooks/useAgencyContext", () => ({
  useAgencyContext: () => ({
    data: {
      name: "Agência X",
      business_type: "trafego_pago",
      context_persona: "p",
      context_icp: {},
      context_qualification: {},
    },
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: (...a: unknown[]) => toastError(...a), info: vi.fn() },
}));

import { useFindNewLeads } from "@/hooks/useLeads";
import { useSendMessage, useToggleAgent } from "@/hooks/useLeadDetail";
import { useDashboardMetrics } from "@/hooks/useDashboardMetrics";

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

/**
 * A postgrest-style chain that is awaitable at any point, so the same object
 * serves `.insert(...)`, `.update(...).eq(...)` and `.select(...).eq(...).single()`.
 */
const makeChain = (result: unknown) => {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "insert", "update", "delete", "eq", "in", "gte", "order", "limit"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.single = vi.fn(() => Promise.resolve(result));
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  chain.then = (onFulfilled: (v: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled);
  return chain;
};

/** How invoke() reports an HTTP/relay/network failure: resolved, not rejected. */
const RESOLVED_FAILURE = { data: null, error: { message: "Relay Error" } };

beforeEach(() => {
  rpc.mockReset();
  invoke.mockReset();
  from.mockReset();
  toastError.mockReset();
  vi.stubGlobal("crypto", { randomUUID: () => "search-fixed" });
});

describe("useFindNewLeads — a charged search whose webhook failed", () => {
  const arrangeCharged = () => {
    rpc.mockImplementation((name: string) => {
      if (name === "request_find_leads") {
        return Promise.resolve({ data: { success: true, cost: 10 }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
  };

  it("refunds via fail_search when invoke resolves with an error", async () => {
    arrangeCharged();
    invoke.mockResolvedValue(RESOLVED_FAILURE);

    const { result } = renderHook(() => useFindNewLeads(), { wrapper });
    await result.current.mutateAsync({ niche: "Padaria", quantity: 10 } as never);

    // The credits were taken by request_find_leads; fail_search is what gives
    // them back. Before the fix this never ran, because invoke resolved.
    await waitFor(() => {
      expect(rpc.mock.calls.map((c) => c[0])).toContain("fail_search");
    });
  });

  it("surfaces it when the refund itself fails", async () => {
    // The compensation failing is the same defect one level down, and it is
    // the expensive one: the user paid and nothing says so.
    rpc.mockImplementation((name: string) => {
      if (name === "request_find_leads") {
        return Promise.resolve({ data: { success: true, cost: 10 }, error: null });
      }
      return Promise.resolve({ data: null, error: { message: "deadlock detected" } });
    });
    invoke.mockResolvedValue(RESOLVED_FAILURE);

    const { result } = renderHook(() => useFindNewLeads(), { wrapper });
    await result.current.mutateAsync({ niche: "Padaria", quantity: 10 } as never);

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(expect.stringContaining("estorno não foi concluído"));
    });
  });
});

describe("useSendMessage — a message that was saved but not delivered", () => {
  beforeEach(() => {
    from.mockImplementation((table: string) => {
      if (table === "profiles") return makeChain({ data: { sdr_name: "MarIA" }, error: null });
      return makeChain({ data: null, error: null });
    });
  });

  it("reports the failure instead of showing it as sent", async () => {
    invoke.mockResolvedValue(RESOLVED_FAILURE);

    const { result } = renderHook(() => useSendMessage(), { wrapper });
    await result.current.mutateAsync({ leadId: "lead-1", content: "olá", sender: "user" });

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(expect.stringContaining("não entregue"));
    });
  });

  it("keeps the message row rather than deleting it", async () => {
    // Deliberate, and pinned so it is not "improved" later: the user wrote
    // that text. `messages` has no delivery-status column, so the honest
    // outcome is a saved message plus an explicit warning -- not data loss.
    invoke.mockResolvedValue(RESOLVED_FAILURE);
    const chains: Record<string, unknown>[] = [];
    from.mockImplementation((table: string) => {
      const chain =
        table === "profiles"
          ? makeChain({ data: { sdr_name: "MarIA" }, error: null })
          : makeChain({ data: null, error: null });
      chains.push(chain);
      return chain;
    });

    const { result } = renderHook(() => useSendMessage(), { wrapper });
    await result.current.mutateAsync({ leadId: "lead-1", content: "olá", sender: "user" });

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    for (const chain of chains) {
      expect(chain.delete as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
    }
  });
});

describe("useToggleAgent — a toggle n8n never heard about", () => {
  it("reverts the committed value when invoke resolves with an error", async () => {
    invoke.mockResolvedValue(RESOLVED_FAILURE);
    const updates: Record<string, unknown>[] = [];
    from.mockImplementation(() => {
      const chain = makeChain({ data: null, error: null });
      const originalUpdate = chain.update as ReturnType<typeof vi.fn>;
      chain.update = vi.fn((payload: Record<string, unknown>) => {
        updates.push(payload);
        return originalUpdate(payload);
      });
      return chain;
    });

    const { result } = renderHook(() => useToggleAgent(), { wrapper });
    await result.current.mutateAsync({
      lead: { id: "lead-1", ai_agent_enabled: false, phone: "5511900000000" } as never,
    });

    // First write flips it to true; the compensation must put it back to the
    // value the row had, because the toggle's only purpose is telling n8n.
    await waitFor(() => expect(updates).toHaveLength(2));
    expect(updates[0].ai_agent_enabled).toBe(true);
    expect(updates[1].ai_agent_enabled).toBe(false);
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining("desfeita"));
  });
});

describe("useDashboardMetrics — a dashboard that hid its own failure", () => {
  it("reaches the error state instead of rendering zeros", async () => {
    // The four queries used to discard `error`, so queryFn never rejected and
    // <ErrorState> was unreachable: an RLS denial rendered as "no data yet".
    from.mockImplementation(() =>
      makeChain({ data: null, error: { message: "permission denied for table leads" } }),
    );

    const { result } = renderHook(() => useDashboardMetrics(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
