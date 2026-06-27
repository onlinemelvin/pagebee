import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireOwner: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/billing", () => ({
  scheduleDowngrade: vi.fn(),
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
import { scheduleDowngrade, BillingError } from "@/lib/modules/billing";

const makeOwner = (clientId = "c1") => ({
  client: { id: clientId },
  ctx: { userId: "u1" },
  role: "owner",
  permissions: [],
});

const req = (body: unknown) =>
  new Request("http://localhost/api/v1/client/billing/downgrade", {
    method: "POST",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/client/billing/downgrade", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(401));
    const res = await POST(req({ toPlan: "NECTAR" }));
    expect(res.status).toBe(401);
    expect(scheduleDowngrade).not.toHaveBeenCalled();
  });

  it("returns 403 when caller is not owner", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(403));
    const res = await POST(req({ toPlan: "NECTAR" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when toPlan is missing", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner() as never);
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    expect(scheduleDowngrade).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed body", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner() as never);
    const res = await POST(
      new Request("http://localhost/api/v1/client/billing/downgrade", { method: "POST", body: "bad" }),
    );
    expect(res.status).toBe(400);
  });

  it("calls scheduleDowngrade with clientId from guard and returns effectiveAt", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner("client-77") as never);
    vi.mocked(scheduleDowngrade).mockResolvedValue({ effectiveAt: "2026-07-01" } as never);

    const res = await POST(req({ toPlan: "NECTAR" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ effectiveAt: "2026-07-01" });
    expect(scheduleDowngrade).toHaveBeenCalledWith("client-77", "NECTAR");
  });

  it("returns BillingError status on billing failure", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner() as never);
    vi.mocked(scheduleDowngrade).mockRejectedValue(new BillingError(409, "already_scheduled"));

    const res = await POST(req({ toPlan: "NECTAR" }));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: "already_scheduled" });
  });
});
