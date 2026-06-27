import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireCapability: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/finance", () => ({
  sendDocument: vi.fn(),
  convertDocument: vi.fn(),
  decideDocument: vi.fn(),
  recordManualPayment: vi.fn(),
  FinanceError: class FinanceError extends Error {
    constructor(public status: number, public code: string) { super(code); }
  },
}));

import { POST } from "./route";
import { requireCapability } from "@/lib/auth/session";
import { sendDocument, convertDocument, decideDocument, recordManualPayment, FinanceError } from "@/lib/modules/finance";

const mockClient = { id: "client-1" };
const mockCtx = { userId: "user-1" };
const routeParams = { params: Promise.resolve({ id: "doc-1" }) };

function makeReq(body: unknown) {
  return new Request("http://localhost/api/v1/client/finance/documents/doc-1/actions", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/client/finance/documents/[id]/actions", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await POST(makeReq({ action: "send" }), routeParams);
    expect(res.status).toBe(401);
    expect(sendDocument).not.toHaveBeenCalled();
  });

  it("returns 403 when capability missing", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(403));
    const res = await POST(makeReq({ action: "send" }), routeParams);
    expect(res.status).toBe(403);
  });

  it("returns 400 for unknown action", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    const res = await POST(makeReq({ action: "unknown_action" }), routeParams);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "unknown_action" });
  });

  it("returns 400 when body is not JSON", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    const res = await POST(
      new Request("http://localhost/api/v1/client/finance/documents/doc-1/actions", { method: "POST", body: "not-json" }),
      routeParams,
    );
    expect(res.status).toBe(400);
  });

  it("dispatches 'send' action and returns document", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    const doc = { id: "doc-1", status: "SENT" };
    vi.mocked(sendDocument).mockResolvedValue(doc as never);
    const res = await POST(makeReq({ action: "send" }), routeParams);
    expect(res.status).toBe(200);
    expect(sendDocument).toHaveBeenCalledWith("client-1", "doc-1");
    await expect(res.json()).resolves.toEqual({ document: doc });
  });

  it("dispatches 'convert' action with toType", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    const doc = { id: "doc-1", docType: "INVOICE" };
    vi.mocked(convertDocument).mockResolvedValue(doc as never);
    const res = await POST(makeReq({ action: "convert", toType: "INVOICE" }), routeParams);
    expect(res.status).toBe(200);
    expect(convertDocument).toHaveBeenCalledWith("client-1", "doc-1", "INVOICE");
  });

  it("dispatches 'decision' action with ACCEPTED", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    const doc = { id: "doc-1" };
    vi.mocked(decideDocument).mockResolvedValue(doc as never);
    const res = await POST(makeReq({ action: "decision", decision: "ACCEPTED" }), routeParams);
    expect(res.status).toBe(200);
    expect(decideDocument).toHaveBeenCalledWith("client-1", "doc-1", "ACCEPTED");
  });

  it("dispatches 'decision' action with DECLINED for any non-ACCEPTED value", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    const doc = { id: "doc-1" };
    vi.mocked(decideDocument).mockResolvedValue(doc as never);
    const res = await POST(makeReq({ action: "decision", decision: "REJECTED" }), routeParams);
    expect(res.status).toBe(200);
    expect(decideDocument).toHaveBeenCalledWith("client-1", "doc-1", "DECLINED");
  });

  it("dispatches 'payment' action with body", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    const doc = { id: "doc-1" };
    vi.mocked(recordManualPayment).mockResolvedValue(doc as never);
    const paymentBody = { action: "payment", amount: 5000, note: "cash" };
    const res = await POST(makeReq(paymentBody), routeParams);
    expect(res.status).toBe(200);
    expect(recordManualPayment).toHaveBeenCalledWith("client-1", "doc-1", paymentBody);
  });

  it("returns FinanceError status from service", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    vi.mocked(sendDocument).mockRejectedValue(new FinanceError(409, "already_sent"));
    const res = await POST(makeReq({ action: "send" }), routeParams);
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: "already_sent" });
  });
});
