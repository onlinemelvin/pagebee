import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireClient: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/team", () => ({
  removeMember: vi.fn(),
  updateMemberPermissions: vi.fn(),
  setMemberDisabled: vi.fn(),
  assertOwner: vi.fn(),
  updatePermissionsSchema: {
    safeParse: vi.fn(),
  },
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

import { PATCH, DELETE } from "./route";
import { requireClient } from "@/lib/auth/session";
import { removeMember, updateMemberPermissions, setMemberDisabled, assertOwner, updatePermissionsSchema, TeamError } from "@/lib/modules/team";

const params = (userId = "user-2") => ({ params: Promise.resolve({ userId }) });

beforeEach(() => {
  vi.clearAllMocks();
});

const mockResult = {
  ctx: { userId: "user-1", email: "owner@test.com" },
  client: { id: "client-1" },
  role: "owner",
  permissions: [],
};

describe("PATCH /api/v1/client/team/member/[userId]", () => {
  const patchReq = (body: unknown, userId = "user-2") =>
    new Request(`http://localhost/api/v1/client/team/member/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireClient).mockRejectedValue(new AuthError(401));
    const res = await PATCH(patchReq({ disabled: true }), params());
    expect(res.status).toBe(401);
  });

  it("returns TeamError status when assertOwner fails", async () => {
    vi.mocked(requireClient).mockResolvedValue(mockResult as never);
    vi.mocked(assertOwner).mockRejectedValue(new TeamError(403, "not_owner"));

    const res = await PATCH(patchReq({ disabled: true }), params("user-2"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("not_owner");
  });

  it("disables a member when { disabled: true }", async () => {
    vi.mocked(requireClient).mockResolvedValue(mockResult as never);
    vi.mocked(assertOwner).mockResolvedValue(undefined as never);
    vi.mocked(setMemberDisabled).mockResolvedValue({ disabled: true } as never);

    const res = await PATCH(patchReq({ disabled: true }), params("user-2"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, disabled: true });
    expect(setMemberDisabled).toHaveBeenCalledWith("client-1", "user-1", "user-2", true);
  });

  it("enables a member when { disabled: false }", async () => {
    vi.mocked(requireClient).mockResolvedValue(mockResult as never);
    vi.mocked(assertOwner).mockResolvedValue(undefined as never);
    vi.mocked(setMemberDisabled).mockResolvedValue({ disabled: false } as never);

    const res = await PATCH(patchReq({ disabled: false }), params("user-2"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, disabled: false });
  });

  it("returns 400 when permissions update is invalid", async () => {
    vi.mocked(requireClient).mockResolvedValue(mockResult as never);
    vi.mocked(assertOwner).mockResolvedValue(undefined as never);
    vi.mocked(updatePermissionsSchema.safeParse).mockReturnValue({
      success: false,
      error: { flatten: () => ({ fieldErrors: { permissions: ["Invalid"] }, formErrors: [] }) },
    } as never);

    const res = await PATCH(patchReq({ permissions: "not-an-array" }), params("user-2"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_error");
  });

  it("updates permissions when valid permissions array provided", async () => {
    vi.mocked(requireClient).mockResolvedValue(mockResult as never);
    vi.mocked(assertOwner).mockResolvedValue(undefined as never);
    vi.mocked(updatePermissionsSchema.safeParse).mockReturnValue({
      success: true,
      data: { permissions: ["inquiries:view"] },
    } as never);
    vi.mocked(updateMemberPermissions).mockResolvedValue({ permissions: ["inquiries:view"] } as never);

    const res = await PATCH(patchReq({ permissions: ["inquiries:view"] }), params("user-2"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, permissions: ["inquiries:view"] });
    expect(updateMemberPermissions).toHaveBeenCalledWith("client-1", "user-2", ["inquiries:view"]);
  });
});

describe("DELETE /api/v1/client/team/member/[userId]", () => {
  const deleteReq = (userId = "user-2") =>
    new Request(`http://localhost/api/v1/client/team/member/${userId}`, {
      method: "DELETE",
    });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireClient).mockRejectedValue(new AuthError(401));
    const res = await DELETE(deleteReq(), params());
    expect(res.status).toBe(401);
    expect(removeMember).not.toHaveBeenCalled();
  });

  it("returns TeamError status when assertOwner fails", async () => {
    vi.mocked(requireClient).mockResolvedValue(mockResult as never);
    vi.mocked(assertOwner).mockRejectedValue(new TeamError(403, "not_owner"));

    const res = await DELETE(deleteReq("user-2"), params("user-2"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("not_owner");
  });

  it("returns TeamError status when removing owner", async () => {
    vi.mocked(requireClient).mockResolvedValue(mockResult as never);
    vi.mocked(assertOwner).mockResolvedValue(undefined as never);
    vi.mocked(removeMember).mockRejectedValue(new TeamError(400, "cannot_remove_owner"));

    const res = await DELETE(deleteReq("user-2"), params("user-2"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("cannot_remove_owner");
  });

  it("removes the member and returns ok on success", async () => {
    vi.mocked(requireClient).mockResolvedValue(mockResult as never);
    vi.mocked(assertOwner).mockResolvedValue(undefined as never);
    vi.mocked(removeMember).mockResolvedValue(undefined as never);

    const res = await DELETE(deleteReq("user-2"), params("user-2"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(removeMember).toHaveBeenCalledWith("client-1", "user-1", "user-2");
  });
});
