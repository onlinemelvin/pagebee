import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireOwner: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/billing", () => ({
  getSavedCard: vi.fn(),
  createCardSetupIntent: vi.fn(),
  setDefaultCardFromSetupIntent: vi.fn(),
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

import { GET, POST } from "./route";
import { requireOwner } from "@/lib/auth/session";
import { getSavedCard, createCardSetupIntent, setDefaultCardFromSetupIntent, BillingError } from "@/lib/modules/billing";

const makeOwner = (clientId = "c1") => ({
  client: { id: clientId },
  ctx: { userId: "u1" },
  role: "owner",
  permissions: [],
});

const postReq = (body: unknown) =>
  new Request("http://localhost/api/v1/client/billing/payment-method", {
    method: "POST",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/client/billing/payment-method", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(401));
    const res = await GET();
    expect(res.status).toBe(401);
    expect(getSavedCard).not.toHaveBeenCalled();
  });

  it("returns 403 when caller is not owner", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(403));
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns the saved card for the client from guard", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner("c-card") as never);
    vi.mocked(getSavedCard).mockResolvedValue({ brand: "visa", last4: "4242", expMonth: 12, expYear: 2028 } as never);

    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      card: { brand: "visa", last4: "4242", expMonth: 12, expYear: 2028 },
    });
    expect(getSavedCard).toHaveBeenCalledWith("c-card");
  });

  it("returns { card: null } when getSavedCard throws (fail-soft)", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner() as never);
    vi.mocked(getSavedCard).mockRejectedValue(new Error("stripe error"));

    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ card: null });
  });
});

describe("POST /api/v1/client/billing/payment-method", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(401));
    const res = await POST(postReq({ action: "setup-intent" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when caller is not owner", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(403));
    const res = await POST(postReq({ action: "setup-intent" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid action", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner() as never);
    const res = await POST(postReq({ action: "bad-action" }));
    expect(res.status).toBe(400);
    expect(createCardSetupIntent).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed body", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner() as never);
    const res = await POST(
      new Request("http://localhost/api/v1/client/billing/payment-method", { method: "POST", body: "bad" }),
    );
    expect(res.status).toBe(400);
  });

  it("calls createCardSetupIntent with clientId from guard for setup-intent action", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner("c-setup") as never);
    vi.mocked(createCardSetupIntent).mockResolvedValue({ clientSecret: "seti_secret" } as never);

    const res = await POST(postReq({ action: "setup-intent" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ clientSecret: "seti_secret" });
    expect(createCardSetupIntent).toHaveBeenCalledWith("c-setup");
  });

  it("calls setDefaultCardFromSetupIntent for set-default action", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner("c-default") as never);
    vi.mocked(setDefaultCardFromSetupIntent).mockResolvedValue({ brand: "mastercard", last4: "1234" } as never);

    const res = await POST(postReq({ action: "set-default", setupIntentId: "seti_abc" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ brand: "mastercard", last4: "1234" });
    expect(setDefaultCardFromSetupIntent).toHaveBeenCalledWith("c-default", "seti_abc");
  });

  it("returns BillingError status on billing failure", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner() as never);
    vi.mocked(createCardSetupIntent).mockRejectedValue(new BillingError(422, "no_customer"));

    const res = await POST(postReq({ action: "setup-intent" }));
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ error: "no_customer" });
  });
});
