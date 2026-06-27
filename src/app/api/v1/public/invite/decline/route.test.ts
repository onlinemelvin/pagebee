import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/modules/team", () => ({ declineInviteByToken: vi.fn() }));

import { GET, POST } from "./route";
import { declineInviteByToken } from "@/lib/modules/team";

const get = (qs = "") => new Request(`http://localhost/api/v1/public/invite/decline${qs}`);
const post = (qs = "") =>
  new Request(`http://localhost/api/v1/public/invite/decline${qs}`, { method: "POST" });

beforeEach(() => vi.clearAllMocks());

describe("GET /api/v1/public/invite/decline", () => {
  it("returns the HTML confirmation page even without a token", async () => {
    const res = await GET(get());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    expect(declineInviteByToken).not.toHaveBeenCalled();
  });

  it("declines the invite when a token is present", async () => {
    vi.mocked(declineInviteByToken).mockResolvedValue(undefined as never);
    const res = await GET(get("?token=tk"));
    expect(res.status).toBe(200);
    expect(declineInviteByToken).toHaveBeenCalledWith("tk");
  });
});

describe("POST /api/v1/public/invite/decline", () => {
  it("400 when token is missing", async () => {
    const res = await POST(post());
    expect(res.status).toBe(400);
    expect(declineInviteByToken).not.toHaveBeenCalled();
  });

  it("happy path: declines and returns ok", async () => {
    vi.mocked(declineInviteByToken).mockResolvedValue(undefined as never);
    const res = await POST(post("?token=tk"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(declineInviteByToken).toHaveBeenCalledWith("tk");
  });
});
