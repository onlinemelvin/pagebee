import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireClient: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/team", () => ({
  revokeInvite: vi.fn(),
  assertOwner: vi.fn(),
  TeamError: class TeamError extends Error {
    code: string;
    status: number;
    constructor(status: number, code: string) {
      super(code);
      this.status = status;
      this.code = code;
    }
  },
}));

import { DELETE } from "./route";
import { requireClient } from "@/lib/auth/session";
import { revokeInvite, assertOwner, TeamError } from "@/lib/modules/team";

const params = (id = "inv-1") => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
});

const mockResult = {
  ctx: { userId: "user-1", email: "owner@test.com" },
  client: { id: "client-1" },
  role: "owner",
  permissions: [],
};

describe("DELETE /api/v1/client/team/invite/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireClient).mockRejectedValue(new AuthError(401));
    const res = await DELETE(new Request("http://localhost/api/v1/client/team/invite/inv-1", { method: "DELETE" }), params());
    expect(res.status).toBe(401);
    expect(revokeInvite).not.toHaveBeenCalled();
  });

  it("returns 403 when caller is not owner (assertOwner fails)", async () => {
    vi.mocked(requireClient).mockResolvedValue(mockResult as never);
    vi.mocked(assertOwner).mockRejectedValue(new TeamError(403, "not_owner"));

    const res = await DELETE(new Request("http://localhost/api/v1/client/team/invite/inv-1", { method: "DELETE" }), params("inv-1"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("not_owner");
  });

  it("returns TeamError status when invite not found", async () => {
    vi.mocked(requireClient).mockResolvedValue(mockResult as never);
    vi.mocked(assertOwner).mockResolvedValue(undefined as never);
    vi.mocked(revokeInvite).mockRejectedValue(new TeamError(404, "invite_not_found"));

    const res = await DELETE(new Request("http://localhost/api/v1/client/team/invite/inv-1", { method: "DELETE" }), params("inv-1"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("invite_not_found");
  });

  it("revokes the invite and returns ok on success", async () => {
    vi.mocked(requireClient).mockResolvedValue(mockResult as never);
    vi.mocked(assertOwner).mockResolvedValue(undefined as never);
    vi.mocked(revokeInvite).mockResolvedValue(undefined as never);

    const res = await DELETE(new Request("http://localhost/api/v1/client/team/invite/inv-1", { method: "DELETE" }), params("inv-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(revokeInvite).toHaveBeenCalledWith("client-1", "inv-1");
  });
});
