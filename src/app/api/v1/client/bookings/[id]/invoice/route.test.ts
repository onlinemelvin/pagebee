import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireCapability: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/finance", () => ({
  createDocumentFromBooking: vi.fn(),
  FinanceError: class FinanceError extends Error {
    constructor(
      public status: number,
      public code: string,
    ) {
      super(code);
    }
  },
}));

import { POST } from "./route";
import { requireCapability } from "@/lib/auth/session";
import { createDocumentFromBooking, FinanceError } from "@/lib/modules/finance";

const makeCtx = (clientId = "client-1") => ({
  ctx: { userId: "user-1" },
  client: { id: clientId },
  role: "owner",
  permissions: [],
});

const makeParams = (id = "bk-1") => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/client/bookings/[id]/invoice", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await POST(
      new Request("http://localhost/", { method: "POST", body: JSON.stringify({}) }),
      makeParams(),
    );
    expect(res.status).toBe(401);
    expect(createDocumentFromBooking).not.toHaveBeenCalled();
  });

  it("returns 403 when lacking finance:manage", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(403));
    const res = await POST(
      new Request("http://localhost/", { method: "POST", body: JSON.stringify({}) }),
      makeParams(),
    );
    expect(res.status).toBe(403);
  });

  it("defaults to INVOICE docType when body is empty", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);
    vi.mocked(createDocumentFromBooking).mockResolvedValue({ id: "doc-1" } as never);

    await POST(
      new Request("http://localhost/", { method: "POST", body: JSON.stringify({}) }),
      makeParams("bk-1"),
    );
    expect(createDocumentFromBooking).toHaveBeenCalledWith("client-1", "bk-1", { docType: "INVOICE" });
  });

  it("passes ESTIMATE docType when specified", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);
    vi.mocked(createDocumentFromBooking).mockResolvedValue({ id: "doc-1" } as never);

    await POST(
      new Request("http://localhost/", { method: "POST", body: JSON.stringify({ docType: "ESTIMATE" }) }),
      makeParams("bk-1"),
    );
    expect(createDocumentFromBooking).toHaveBeenCalledWith("client-1", "bk-1", { docType: "ESTIMATE" });
  });

  it("passes QUOTE docType when specified", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);
    vi.mocked(createDocumentFromBooking).mockResolvedValue({ id: "doc-1" } as never);

    await POST(
      new Request("http://localhost/", { method: "POST", body: JSON.stringify({ docType: "QUOTE" }) }),
      makeParams("bk-1"),
    );
    expect(createDocumentFromBooking).toHaveBeenCalledWith("client-1", "bk-1", { docType: "QUOTE" });
  });

  it("ignores unknown docType values and defaults to INVOICE", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);
    vi.mocked(createDocumentFromBooking).mockResolvedValue({ id: "doc-1" } as never);

    await POST(
      new Request("http://localhost/", { method: "POST", body: JSON.stringify({ docType: "RECEIPT" }) }),
      makeParams("bk-1"),
    );
    expect(createDocumentFromBooking).toHaveBeenCalledWith("client-1", "bk-1", { docType: "INVOICE" });
  });

  it("returns FinanceError status when service throws", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);
    vi.mocked(createDocumentFromBooking).mockRejectedValue(new FinanceError(404, "booking_not_found"));

    const res = await POST(
      new Request("http://localhost/", { method: "POST", body: JSON.stringify({}) }),
      makeParams("missing"),
    );
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: "booking_not_found" });
  });

  it("returns 201 with document on success, scoped by guard clientId", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx("t-99") as never);
    const document = { id: "doc-1", docType: "INVOICE" };
    vi.mocked(createDocumentFromBooking).mockResolvedValue(document as never);

    const res = await POST(
      new Request("http://localhost/", { method: "POST", body: JSON.stringify({}) }),
      makeParams("bk-1"),
    );
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ document });
    expect(createDocumentFromBooking).toHaveBeenCalledWith("t-99", "bk-1", { docType: "INVOICE" });
  });
});
