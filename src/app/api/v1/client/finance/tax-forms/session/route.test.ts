import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireOwner: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/payments", () => ({
  createTaxDocumentsSession: vi.fn(),
  PaymentError: class PaymentError extends Error {
    constructor(public status: number, public code: string) { super(code); }
  },
}));

import { POST } from "./route";
import { requireOwner } from "@/lib/auth/session";
import { createTaxDocumentsSession, PaymentError } from "@/lib/modules/payments";

const mockClient = { id: "client-1" };
const mockCtx = { userId: "user-1" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/client/finance/tax-forms/session", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(401));
    const res = await POST();
    expect(res.status).toBe(401);
    expect(createTaxDocumentsSession).not.toHaveBeenCalled();
  });

  it("returns 403 when not owner", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(403));
    const res = await POST();
    expect(res.status).toBe(403);
  });

  it("returns PaymentError status from service", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    vi.mocked(createTaxDocumentsSession).mockRejectedValue(new PaymentError(402, "stripe_not_configured"));
    const res = await POST();
    expect(res.status).toBe(402);
    await expect(res.json()).resolves.toMatchObject({ error: "stripe_not_configured" });
  });

  it("returns 200 with session and no-store cache header on success", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: mockClient, ctx: mockCtx } as never);
    const session = { clientSecret: "accs_secret_abc" };
    vi.mocked(createTaxDocumentsSession).mockResolvedValue(session as never);
    const res = await POST();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(createTaxDocumentsSession).toHaveBeenCalledWith("client-1");
    await expect(res.json()).resolves.toEqual(session);
  });
});
