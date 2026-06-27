import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireOwner: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/billing", () => ({
  syncCheckoutSession: vi.fn(),
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
import { syncCheckoutSession, BillingError } from "@/lib/modules/billing";

const makeOwner = (clientId = "c1") => ({
  client: { id: clientId },
  ctx: { userId: "u1" },
  role: "owner",
  permissions: [],
});

const req = (body: unknown) =>
  new Request("http://localhost/api/v1/client/billing/checkout/sync", {
    method: "POST",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/client/billing/checkout/sync", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(401));
    const res = await POST(req({ sessionId: "cs_test_123" }));
    expect(res.status).toBe(401);
    expect(syncCheckoutSession).not.toHaveBeenCalled();
  });

  it("returns 403 when caller is not owner", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(403));
    const res = await POST(req({ sessionId: "cs_test_123" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when sessionId is missing", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner() as never);
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    expect(syncCheckoutSession).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed body", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner() as never);
    const res = await POST(
      new Request("http://localhost/api/v1/client/billing/checkout/sync", { method: "POST", body: "bad" }),
    );
    expect(res.status).toBe(400);
  });

  it("calls syncCheckoutSession with clientId from guard and returns result", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner("client-99") as never);
    vi.mocked(syncCheckoutSession).mockResolvedValue({ applied: true } as never);

    const res = await POST(req({ sessionId: "cs_test_abc" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ applied: true });
    expect(syncCheckoutSession).toHaveBeenCalledWith("client-99", "cs_test_abc");
  });

  it("returns BillingError status on billing failure", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner() as never);
    vi.mocked(syncCheckoutSession).mockRejectedValue(new BillingError(404, "session_not_found"));

    const res = await POST(req({ sessionId: "cs_test_abc" }));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: "session_not_found" });
  });
});
