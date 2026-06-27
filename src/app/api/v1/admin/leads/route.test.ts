import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireAdmin: vi.fn(),
  requirePermission: vi.fn(),
  requireReview: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/lead", () => ({
  listLeads: vi.fn(),
  LEAD_STATUSES: ["NEW", "CONTACTED", "QUALIFIED", "BOOKED", "WON", "LOST", "SPAM"],
}));

import { GET } from "./route";
import { requireAdmin } from "@/lib/auth/session";
import { listLeads } from "@/lib/modules/lead";

const req = (qs = "") => new Request(`http://localhost/api/v1/admin/leads${qs}`);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/admin/leads", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new AuthError(401));
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(listLeads).not.toHaveBeenCalled();
  });

  it("returns 403 for non-admin", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new AuthError(403));
    const res = await GET(req());
    expect(res.status).toBe(403);
  });

  it("passes valid status param to service", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({} as never);
    vi.mocked(listLeads).mockResolvedValue([] as never);

    await GET(req("?status=NEW"));
    expect(listLeads).toHaveBeenCalledWith({ status: "NEW" });
  });

  it("drops invalid status value", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({} as never);
    vi.mocked(listLeads).mockResolvedValue([] as never);

    await GET(req("?status=INVALID"));
    expect(listLeads).toHaveBeenCalledWith({ status: undefined });
  });

  it("returns leads on success", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({} as never);
    const mockLeads = [{ id: "l1", name: "Alice" }];
    vi.mocked(listLeads).mockResolvedValue(mockLeads as never);

    const res = await GET(req());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ leads: mockLeads });
  });
});
