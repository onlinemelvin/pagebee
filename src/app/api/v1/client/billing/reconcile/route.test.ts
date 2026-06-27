import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireOwner: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/billing", () => ({
  reconcileFromStripe: vi.fn(),
}));

import { POST } from "./route";
import { requireOwner } from "@/lib/auth/session";
import { reconcileFromStripe } from "@/lib/modules/billing";

const makeOwner = (clientId = "c1") => ({
  client: { id: clientId },
  ctx: { userId: "u1" },
  role: "owner",
  permissions: [],
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/client/billing/reconcile", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(401));
    const res = await POST();
    expect(res.status).toBe(401);
    expect(reconcileFromStripe).not.toHaveBeenCalled();
  });

  it("returns 403 when caller is not owner", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(403));
    const res = await POST();
    expect(res.status).toBe(403);
  });

  it("calls reconcileFromStripe with clientId from guard and returns result", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner("c-reconcile") as never);
    vi.mocked(reconcileFromStripe).mockResolvedValue({ status: "applied", plan: "HIVE" } as never);

    const res = await POST();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: "applied", plan: "HIVE" });
    expect(reconcileFromStripe).toHaveBeenCalledWith("c-reconcile");
  });

  it("returns 500 when reconcileFromStripe throws", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner() as never);
    vi.mocked(reconcileFromStripe).mockRejectedValue(new Error("stripe error"));

    const res = await POST();
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: "failed" });
  });
});
