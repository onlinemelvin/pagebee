import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireOwner: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/billing", () => ({
  listBillingInvoices: vi.fn(),
}));

import { GET } from "./route";
import { requireOwner } from "@/lib/auth/session";
import { listBillingInvoices } from "@/lib/modules/billing";

const makeOwner = (clientId = "c1") => ({
  client: { id: clientId },
  ctx: { userId: "u1" },
  role: "owner",
  permissions: [],
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/client/billing/invoices", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(401));
    const res = await GET();
    expect(res.status).toBe(401);
    expect(listBillingInvoices).not.toHaveBeenCalled();
  });

  it("returns 403 when caller is not owner", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(403));
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("calls listBillingInvoices with clientId from guard and returns invoices", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner("client-33") as never);
    vi.mocked(listBillingInvoices).mockResolvedValue([{ id: "inv_1", amountCents: 9900 }] as never);

    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ invoices: [{ id: "inv_1", amountCents: 9900 }] });
    expect(listBillingInvoices).toHaveBeenCalledWith("client-33");
  });

  it("returns empty array when listBillingInvoices throws (fail-soft)", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner() as never);
    vi.mocked(listBillingInvoices).mockRejectedValue(new Error("stripe down"));

    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ invoices: [] });
  });
});
