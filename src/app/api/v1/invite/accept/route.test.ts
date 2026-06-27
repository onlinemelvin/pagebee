import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getAuthContext: vi.fn(),
}));
vi.mock("@/lib/modules/team", () => ({
  acceptInvite: vi.fn(),
  acceptInviteSchema: {
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
const posthogCapture = vi.hoisted(() => vi.fn());
vi.mock("@/lib/posthog-server", () => ({
  getPostHogClient: () => ({ capture: posthogCapture }),
}));

import { POST } from "./route";
import { getAuthContext } from "@/lib/auth/session";
import { acceptInvite, acceptInviteSchema, TeamError } from "@/lib/modules/team";

function makeReq(body: unknown = { token: "invite_token_abc" }) {
  return new Request("http://localhost/api/v1/invite/accept", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Helper — make acceptInviteSchema.safeParse succeed or fail
function mockSchemaParse(success: boolean, data?: unknown) {
  if (success) {
    vi.mocked(acceptInviteSchema.safeParse).mockReturnValue({
      success: true,
      data: data ?? { token: "invite_token_abc" },
    } as never);
  } else {
    vi.mocked(acceptInviteSchema.safeParse).mockReturnValue({
      success: false,
      error: { flatten: () => ({ fieldErrors: {}, formErrors: ["invalid"] }) },
    } as never);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/invite/accept", () => {
  it("returns 400 when body fails schema validation", async () => {
    mockSchemaParse(false);
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "validation_error" });
    expect(acceptInvite).not.toHaveBeenCalled();
  });

  it("returns 400 when body is not valid JSON (schema parse receives empty object)", async () => {
    mockSchemaParse(false);
    // Route does req.json().catch(() => ({})), so invalid JSON becomes {}
    const req = new Request("http://localhost/api/v1/invite/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("calls acceptInvite with token and current session userId on success", async () => {
    mockSchemaParse(true, { token: "invite_token_abc" });
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "user_existing" } as never);
    vi.mocked(acceptInvite).mockResolvedValue({ email: "bob@example.com", createdAccount: false } as never);


    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, email: "bob@example.com", createdAccount: false });
    expect(acceptInvite).toHaveBeenCalledWith("invite_token_abc", {
      userId: "user_existing",
      name: undefined,
      password: undefined,
    });
  });

  it("calls acceptInvite with name+password when no session (new account path)", async () => {
    mockSchemaParse(true, { token: "t1", name: "Alice", password: "pass123" });
    vi.mocked(getAuthContext).mockResolvedValue(null);
    vi.mocked(acceptInvite).mockResolvedValue({ email: "alice@example.com", createdAccount: true } as never);

    const res = await POST(makeReq({ token: "t1", name: "Alice", password: "pass123" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, createdAccount: true });
    expect(acceptInvite).toHaveBeenCalledWith("t1", {
      userId: undefined,
      name: "Alice",
      password: "pass123",
    });
  });

  it("captures a posthog event on success", async () => {
    mockSchemaParse(true, { token: "t2" });
    vi.mocked(getAuthContext).mockResolvedValue(null);
    vi.mocked(acceptInvite).mockResolvedValue({ email: "carol@example.com", createdAccount: false } as never);

    await POST(makeReq({ token: "t2" }));
    expect(posthogCapture).toHaveBeenCalledWith(
      expect.objectContaining({ event: "team_invite_accepted", distinctId: "carol@example.com" }),
    );
  });

  it("returns TeamError status and code when acceptInvite throws TeamError", async () => {
    mockSchemaParse(true, { token: "expired-token" });
    vi.mocked(getAuthContext).mockResolvedValue(null);
    const err = new TeamError(410, "invite_expired");
    vi.mocked(acceptInvite).mockRejectedValue(err);

    const res = await POST(makeReq({ token: "expired-token" }));
    expect(res.status).toBe(410);
    await expect(res.json()).resolves.toMatchObject({ error: "invite_expired" });
  });

  it("returns 500 for unexpected errors", async () => {
    mockSchemaParse(true, { token: "t3" });
    vi.mocked(getAuthContext).mockResolvedValue(null);
    vi.mocked(acceptInvite).mockRejectedValue(new Error("unexpected db error"));

    const res = await POST(makeReq({ token: "t3" }));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: "failed" });
  });
});
