import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireOwner: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/billing", () => ({
  createBillingIntent: vi.fn(),
  recordBillingAgreement: vi.fn(),
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
import { createBillingIntent, recordBillingAgreement, BillingError } from "@/lib/modules/billing";

const makeOwner = (clientId = "c1", isTest = false) => ({
  client: { id: clientId, isTest },
  ctx: { userId: "u1" },
  role: "owner",
  permissions: [],
});

const req = (body: unknown) =>
  new Request("http://localhost/api/v1/client/billing/intent", {
    method: "POST",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/client/billing/intent", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(401));
    const res = await POST(req({ flow: "setup" }));
    expect(res.status).toBe(401);
    expect(createBillingIntent).not.toHaveBeenCalled();
  });

  it("returns 403 when caller is not owner", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(403));
    const res = await POST(req({ flow: "setup" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid flow value", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner() as never);
    const res = await POST(req({ flow: "bad_flow" }));
    expect(res.status).toBe(400);
    expect(createBillingIntent).not.toHaveBeenCalled();
  });

  it("calls createBillingIntent with clientId and isTest from guard (not body)", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner("client-55", true) as never);
    vi.mocked(createBillingIntent).mockResolvedValue({ kind: "applied" } as never);

    const res = await POST(req({ flow: "setup" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ kind: "applied" });
    expect(createBillingIntent).toHaveBeenCalledWith(
      { id: "client-55", isTest: true },
      "setup",
      undefined,
      undefined,
    );
  });

  it("records billing agreement when acceptedTerms=true and kind=card", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner("c-terms") as never);
    vi.mocked(createBillingIntent).mockResolvedValue({
      kind: "card",
      clientSecret: "pi_secret",
      amountCents: 9900,
      planLabel: "HIVE",
      flow: "setup",
    } as never);
    vi.mocked(recordBillingAgreement).mockResolvedValue(undefined as never);

    const res = await POST(req({ flow: "setup", toPlan: "HIVE", acceptedTerms: true }));
    expect(res.status).toBe(200);
    expect(recordBillingAgreement).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "c-terms", amountCents: 9900 }),
    );
  });

  it("does not record billing agreement when acceptedTerms=false", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner() as never);
    vi.mocked(createBillingIntent).mockResolvedValue({ kind: "applied" } as never);

    await POST(req({ flow: "setup", acceptedTerms: false }));
    expect(recordBillingAgreement).not.toHaveBeenCalled();
  });

  it("passes amountCents as integer cents (not transformed)", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner("c-cents") as never);
    vi.mocked(createBillingIntent).mockResolvedValue({
      kind: "card",
      clientSecret: "pi_secret",
      amountCents: 4999,
      planLabel: "HONEY",
      flow: "upgrade",
    } as never);
    vi.mocked(recordBillingAgreement).mockResolvedValue(undefined as never);

    await POST(req({ flow: "upgrade", toPlan: "HONEY", acceptedTerms: true }));
    expect(recordBillingAgreement).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 4999 }),
    );
  });

  it("returns BillingError status on billing failure", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner() as never);
    vi.mocked(createBillingIntent).mockRejectedValue(new BillingError(503, "no_stripe"));

    const res = await POST(req({ flow: "setup" }));
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({ error: "no_stripe" });
  });
});
