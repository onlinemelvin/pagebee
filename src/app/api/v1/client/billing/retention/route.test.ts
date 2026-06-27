import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireOwner: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/billing", () => ({
  applyRetentionDiscount: vi.fn(),
  BillingError: class BillingError extends Error {
    code: string;
    status: number;
    constructor(status: number, code: string) {
      super(code);
      this.status = status;
      this.code = code;
    }
  },
}));

import { POST } from "./route";
import { requireOwner } from "@/lib/auth/session";
import { applyRetentionDiscount, BillingError } from "@/lib/modules/billing";

const makeOwner = (clientId = "c1") => ({
  client: { id: clientId },
  ctx: { userId: "u1" },
  role: "owner",
  permissions: [],
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/client/billing/retention", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(401));
    const res = await POST();
    expect(res.status).toBe(401);
    expect(applyRetentionDiscount).not.toHaveBeenCalled();
  });

  it("returns 403 when caller is not owner", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(403));
    const res = await POST();
    expect(res.status).toBe(403);
  });

  it("calls applyRetentionDiscount with clientId from guard and returns result", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner("c-retain") as never);
    vi.mocked(applyRetentionDiscount).mockResolvedValue({ discountApplied: true, cycles: 3 } as never);

    const res = await POST();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ discountApplied: true, cycles: 3 });
    expect(applyRetentionDiscount).toHaveBeenCalledWith("c-retain");
  });

  it("returns BillingError status when offer already used", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner() as never);
    vi.mocked(applyRetentionDiscount).mockRejectedValue(new BillingError(409, "offer_already_used"));

    const res = await POST();
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: "offer_already_used" });
  });

  it("returns 500 on unexpected error", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner() as never);
    vi.mocked(applyRetentionDiscount).mockRejectedValue(new Error("unexpected"));

    const res = await POST();
    expect(res.status).toBe(500);
  });
});
