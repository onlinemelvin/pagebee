import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

// Guard + service are mocked so the test exercises the route's own wiring:
// auth enforcement, query-param sanitisation, and the response shape.
vi.mock("@/lib/auth/session", () => ({
  requireAdmin: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/email", () => ({ listEmailLogs: vi.fn() }));

import { GET } from "./route";
import { requireAdmin } from "@/lib/auth/session";
import { listEmailLogs } from "@/lib/modules/email";

const req = (qs = "") => new Request(`http://localhost/api/v1/admin/email/logs${qs}`);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/admin/email/logs", () => {
  it("returns 401 when the caller is not authenticated", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new AuthError(401));
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(listEmailLogs).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-admin caller", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new AuthError(403));
    const res = await GET(req());
    expect(res.status).toBe(403);
  });

  it("passes only whitelisted status/category through to the service", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({} as never);
    vi.mocked(listEmailLogs).mockResolvedValue({ items: [], nextCursor: null } as never);

    await GET(req("?status=SENT&category=BILLING&search=foo"));
    expect(listEmailLogs).toHaveBeenCalledWith(
      expect.objectContaining({ status: "SENT", category: "BILLING", search: "foo" }),
    );
  });

  it("drops invalid status/category values (defends the enum cast)", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({} as never);
    vi.mocked(listEmailLogs).mockResolvedValue({ items: [], nextCursor: null } as never);

    await GET(req("?status=DROP_TABLE&category=NOPE"));
    expect(listEmailLogs).toHaveBeenCalledWith(
      expect.objectContaining({ status: undefined, category: undefined }),
    );
  });

  it("returns the service result as JSON on success", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({} as never);
    const payload = { items: [{ id: "e1" }], nextCursor: "c2" };
    vi.mocked(listEmailLogs).mockResolvedValue(payload as never);

    const res = await GET(req());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(payload);
  });
});
