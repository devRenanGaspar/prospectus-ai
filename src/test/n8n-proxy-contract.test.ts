import { describe, expect, it } from "vitest";
import {
  deductCreditsBulkRequestSchema,
  deductCreditsRequestSchema,
  getLeadByPhoneRequestSchema,
  insertLeadsRequestSchema,
  insertMessageRequestSchema,
  n8nProxyModeledRequestSchema,
  queryLeadsRequestSchema,
  updateCopyRequestStatusRequestSchema,
  updateLeadStatusRequestSchema,
  updateSendRequestStatusRequestSchema,
} from "@/lib/n8n-proxy-contract";

const uuid1 = "11111111-1111-1111-1111-111111111111";
const uuid2 = "22222222-2222-2222-2222-222222222222";

describe("n8n-proxy contract — valid payloads parse", () => {
  it("insert_leads", () => {
    expect(
      insertLeadsRequestSchema.parse({
        action: "insert_leads",
        leads: [{ google_place_id: "DEMO-1", phone: "5511900000000", name: "Synthetic Biz" }],
        search_id: uuid1,
      }),
    ).toBeTruthy();
  });

  it("insert_leads accepts an empty-string field that index.ts would sanitize to null", () => {
    expect(
      insertLeadsRequestSchema.parse({
        action: "insert_leads",
        leads: [{ phone: "" }],
      }),
    ).toBeTruthy();
  });

  it("update_lead_status", () => {
    expect(
      updateLeadStatusRequestSchema.parse({
        action: "update_lead_status",
        lead_id: uuid1,
        status: "SCHEDULED",
      }),
    ).toBeTruthy();
  });

  it("insert_message", () => {
    expect(
      insertMessageRequestSchema.parse({
        action: "insert_message",
        lead_id: uuid1,
        content: "Oi!",
        sender: "LEAD",
      }),
    ).toBeTruthy();
  });

  it("get_lead_by_phone", () => {
    expect(
      getLeadByPhoneRequestSchema.parse({ action: "get_lead_by_phone", phone: "5511900000000" }),
    ).toBeTruthy();
  });

  it("query_leads", () => {
    expect(
      queryLeadsRequestSchema.parse({
        action: "query_leads",
        filters: { phone: "5511900000000" },
        limit: 1,
      }),
    ).toBeTruthy();
  });

  it("update_copy_request_status / update_send_request_status", () => {
    expect(
      updateCopyRequestStatusRequestSchema.parse({
        action: "update_copy_request_status",
        copy_request_id: uuid1,
        status: "completed",
      }),
    ).toBeTruthy();
    expect(
      updateSendRequestStatusRequestSchema.parse({
        action: "update_send_request_status",
        send_request_id: uuid1,
        status: "failed",
      }),
    ).toBeTruthy();
  });

  it("deduct_credits / deduct_credits_bulk", () => {
    expect(
      deductCreditsRequestSchema.parse({
        action: "deduct_credits",
        user_id: uuid1,
        action_name: "GENERATE_COPY",
        lead_id: uuid2,
      }),
    ).toBeTruthy();
    expect(
      deductCreditsBulkRequestSchema.parse({
        action: "deduct_credits_bulk",
        user_id: uuid1,
        action_name: "FIND_LEADS",
        quantity: 10,
      }),
    ).toBeTruthy();
  });

  it("the discriminated union routes each action to its own schema", () => {
    expect(
      n8nProxyModeledRequestSchema.parse({
        action: "get_lead_by_phone",
        phone: "5511900000000",
      }),
    ).toBeTruthy();
  });
});

describe("n8n-proxy contract — catches real mistakes", () => {
  it("rejects an unknown lead status (e.g. a typo an n8n node could send)", () => {
    expect(() =>
      updateLeadStatusRequestSchema.parse({
        action: "update_lead_status",
        lead_id: uuid1,
        status: "SCHEDULLED",
      }),
    ).toThrow();
  });

  it("rejects a message sender outside the messages.sender CHECK constraint", () => {
    expect(() =>
      insertMessageRequestSchema.parse({
        action: "insert_message",
        lead_id: uuid1,
        content: "Oi!",
        sender: "BOT",
      }),
    ).toThrow();
  });

  it("rejects insert_leads with an empty leads array", () => {
    expect(() =>
      insertLeadsRequestSchema.parse({ action: "insert_leads", leads: [] }),
    ).toThrow();
  });

  it("rejects query_leads with a filter column outside index.ts's allow-list", () => {
    expect(() =>
      queryLeadsRequestSchema.parse({
        action: "query_leads",
        filters: { website_analysis: "anything" },
      }),
    ).toThrow();
  });

  it("rejects deduct_credits_bulk with a non-positive quantity", () => {
    expect(() =>
      deductCreditsBulkRequestSchema.parse({
        action: "deduct_credits_bulk",
        user_id: uuid1,
        action_name: "FIND_LEADS",
        quantity: 0,
      }),
    ).toThrow();
  });

  it("rejects a lead_id that isn't a UUID", () => {
    expect(() =>
      updateLeadStatusRequestSchema.parse({
        action: "update_lead_status",
        lead_id: "not-a-uuid",
        status: "NEW",
      }),
    ).toThrow();
  });
});
