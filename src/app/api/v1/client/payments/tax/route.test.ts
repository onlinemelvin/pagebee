import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireOwner: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/payments", () => ({
  getTaxStatus: vi.fn(),
  syncTaxRegistrations: vi.fn(),
  PaymentError: class PaymentError extends Error {
    code: string;
    status: number;
    constructor(status: number, code: string) {
      super(code);
      this.status = status;
      this.code = code;
    }
  },
}));
vi.mock("@/lib/modules/finance", () => ({
  getFinanceSettings: vi.fn(),
  saveFinanceSettings: vi.fn(),
}));

import { GET, PUT } from "./route";
import { requireOwner } from "@/lib/auth/session";
import { getTaxStatus, syncTaxRegistrations, PaymentError } from "@/lib/modules/payments";
import { getFinanceSettings, saveFinanceSettings } from "@/lib/modules/finance";

const makeOwner = (clientId = "c1") => ({
  client: { id: clientId },
  ctx: { userId: "u1" },
  role: "owner",
  permissions: [],
});

const putReq = (body: unknown) =>
  new Request("http://localhost/api/v1/client/payments/tax", {
    method: "PUT",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/client/payments/tax", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(401));
    const res = await GET();
    expect(res.status).toBe(401);
    expect(getTaxStatus).not.toHaveBeenCalled();
  });

  it("returns 403 when caller is not owner", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(403));
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns tax status for client from guard", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner("c-tax") as never);
    vi.mocked(getTaxStatus).mockResolvedValue({ active: true, mode: "automatic", states: ["CA"] } as never);

    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: { active: true, mode: "automatic", states: ["CA"] } });
    expect(getTaxStatus).toHaveBeenCalledWith("c-tax");
  });
});

describe("PUT /api/v1/client/payments/tax", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(401));
    const res = await PUT(putReq({ mode: "automatic", states: ["CA"] }));
    expect(res.status).toBe(401);
    expect(syncTaxRegistrations).not.toHaveBeenCalled();
  });

  it("returns 403 when caller is not owner", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(403));
    const res = await PUT(putReq({ mode: "automatic" }));
    expect(res.status).toBe(403);
  });

  it("calls syncTaxRegistrations when mode=automatic", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner("c-auto") as never);
    vi.mocked(syncTaxRegistrations).mockResolvedValue({ active: true, states: ["CA", "NY"] } as never);

    const res = await PUT(putReq({ mode: "automatic", states: ["CA", "NY"] }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: { active: true, states: ["CA", "NY"] } });
    expect(syncTaxRegistrations).toHaveBeenCalledWith("c-auto", ["CA", "NY"]);
  });

  it("defaults to empty states array when states is not an array", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner("c-nostate") as never);
    vi.mocked(syncTaxRegistrations).mockResolvedValue({ active: true, states: [] } as never);

    await PUT(putReq({ mode: "automatic" }));
    expect(syncTaxRegistrations).toHaveBeenCalledWith("c-nostate", []);
  });

  it("saves taxMode=manual and returns updated status when mode=manual", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner("c-manual") as never);
    vi.mocked(getFinanceSettings).mockResolvedValue({ taxMode: "automatic", currency: "usd" } as never);
    vi.mocked(saveFinanceSettings).mockResolvedValue(undefined as never);
    vi.mocked(getTaxStatus).mockResolvedValue({ active: false, mode: "manual" } as never);

    const res = await PUT(putReq({ mode: "manual" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: { active: false, mode: "manual" } });
    expect(syncTaxRegistrations).not.toHaveBeenCalled();
    expect(saveFinanceSettings).toHaveBeenCalledWith(
      "c-manual",
      expect.objectContaining({ taxMode: "manual" }),
    );
    expect(getTaxStatus).toHaveBeenCalledWith("c-manual");
  });

  it("returns PaymentError status on payment failure", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner() as never);
    vi.mocked(syncTaxRegistrations).mockRejectedValue(new PaymentError(422, "tax_not_enabled"));

    const res = await PUT(putReq({ mode: "automatic", states: ["CA"] }));
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ error: "tax_not_enabled" });
  });

  it("returns 400 stripe_error with message on unexpected Error", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner() as never);
    vi.mocked(syncTaxRegistrations).mockRejectedValue(new Error("Invalid state code"));

    const res = await PUT(putReq({ mode: "automatic", states: ["XX"] }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "stripe_error", message: "Invalid state code" });
  });
});
