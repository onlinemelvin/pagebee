import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireClient: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/team", () => ({
  inviteMember: vi.fn(),
  checkInviteEmail: vi.fn(),
  assertOwner: vi.fn(),
  inviteInputSchema: {
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

import { GET, POST } from "./route";
import { requireClient } from "@/lib/auth/session";
import { inviteMember, checkInviteEmail, assertOwner, inviteInputSchema, TeamError } from "@/lib/modules/team";

beforeEach(() => {
  vi.clearAllMocks();
});

const mockResult = {
  ctx: { userId: "user-1", email: "owner@test.com" },
  client: { id: "client-1" },
  role: "owner",
  permissions: [],
};

describe("GET /api/v1/client/team/invite", () => {
  const getReq = (email?: string) =>
    new Request(`http://localhost/api/v1/client/team/invite${email ? `?email=${encodeURIComponent(email)}` : ""}`);

  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireClient).mockRejectedValue(new AuthError(401));
    const res = await GET(getReq("test@example.com"));
    expect(res.status).toBe(401);
    expect(checkInviteEmail).not.toHaveBeenCalled();
  });

  it("returns 400 for missing email param", async () => {
    vi.mocked(requireClient).mockResolvedValue(mockResult as never);
    const res = await GET(getReq());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_error");
  });

  it("returns 400 for invalid email format", async () => {
    vi.mocked(requireClient).mockResolvedValue(mockResult as never);
    const res = await GET(getReq("not-an-email"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_error");
  });

  it("returns TeamError status when assertOwner fails", async () => {
    vi.mocked(requireClient).mockResolvedValue(mockResult as never);
    vi.mocked(assertOwner).mockRejectedValue(new TeamError(403, "not_owner"));

    const res = await GET(getReq("staff@example.com"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("not_owner");
  });

  it("returns email check result on success", async () => {
    vi.mocked(requireClient).mockResolvedValue(mockResult as never);
    vi.mocked(assertOwner).mockResolvedValue(undefined as never);
    const result = { status: "free" };
    vi.mocked(checkInviteEmail).mockResolvedValue(result as never);

    const res = await GET(getReq("new@example.com"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(result);
    expect(checkInviteEmail).toHaveBeenCalledWith("client-1", "new@example.com");
  });
});

describe("POST /api/v1/client/team/invite", () => {
  const postReq = (body: unknown) =>
    new Request("http://localhost/api/v1/client/team/invite", {
      method: "POST",
      body: JSON.stringify(body),
    });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireClient).mockRejectedValue(new AuthError(401));
    vi.mocked(inviteInputSchema.safeParse).mockReturnValue({ success: true, data: { email: "x@x.com", role: "staff", permissions: [] } } as never);
    const res = await POST(postReq({ email: "staff@example.com", role: "staff" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid invite input", async () => {
    vi.mocked(requireClient).mockResolvedValue(mockResult as never);
    vi.mocked(inviteInputSchema.safeParse).mockReturnValue({
      success: false,
      error: { flatten: () => ({ fieldErrors: { email: ["Invalid email"] }, formErrors: [] }) },
    } as never);

    const res = await POST(postReq({ email: "bad", role: "staff" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_error");
  });

  it("returns TeamError status when seat limit reached", async () => {
    vi.mocked(requireClient).mockResolvedValue(mockResult as never);
    vi.mocked(inviteInputSchema.safeParse).mockReturnValue({
      success: true,
      data: { email: "staff@example.com", role: "staff", permissions: [] },
    } as never);
    vi.mocked(assertOwner).mockResolvedValue(undefined as never);
    vi.mocked(inviteMember).mockRejectedValue(new TeamError(403, "seat_limit_reached"));

    const res = await POST(postReq({ email: "staff@example.com", role: "staff" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("seat_limit_reached");
  });

  it("invites a member and returns ok with id on success", async () => {
    vi.mocked(requireClient).mockResolvedValue(mockResult as never);
    vi.mocked(inviteInputSchema.safeParse).mockReturnValue({
      success: true,
      data: { email: "staff@example.com", role: "staff", permissions: ["inquiries:view"] },
    } as never);
    vi.mocked(assertOwner).mockResolvedValue(undefined as never);
    vi.mocked(inviteMember).mockResolvedValue({ id: "inv-1" } as never);

    const res = await POST(postReq({ email: "staff@example.com", role: "staff", permissions: ["inquiries:view"] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, id: "inv-1" });
    expect(inviteMember).toHaveBeenCalledWith("client-1", "user-1", "staff@example.com", "staff", ["inquiries:view"]);
  });
});
