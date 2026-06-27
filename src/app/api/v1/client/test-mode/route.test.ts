import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireOwner: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/auth/policy", () => ({
  isTestModeEligible: vi.fn(),
}));
vi.mock("@/lib/modules/client", () => ({
  setClientFeature: vi.fn(),
  TEST_MODE_KEY: "__test_mode__",
}));

import { POST } from "./route";
import { requireOwner } from "@/lib/auth/session";
import { isTestModeEligible } from "@/lib/auth/policy";
import { setClientFeature, TEST_MODE_KEY } from "@/lib/modules/client";

beforeEach(() => {
  vi.clearAllMocks();
});

const mockResult = {
  ctx: { userId: "user-1", email: "owner@test.com" },
  client: { id: "client-1" },
  role: "owner",
  permissions: [],
};

const postReq = (body: unknown) =>
  new Request("http://localhost/api/v1/client/test-mode", {
    method: "POST",
    body: JSON.stringify(body),
  });

describe("POST /api/v1/client/test-mode", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(401));
    const res = await POST(postReq({ enabled: true }));
    expect(res.status).toBe(401);
    expect(setClientFeature).not.toHaveBeenCalled();
  });

  it("returns 403 when caller is staff not owner", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(403));
    const res = await POST(postReq({ enabled: true }));
    expect(res.status).toBe(403);
  });

  it("returns 403 when email is not eligible for test mode", async () => {
    vi.mocked(requireOwner).mockResolvedValue(mockResult as never);
    vi.mocked(isTestModeEligible).mockReturnValue(false);

    const res = await POST(postReq({ enabled: true }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("not_eligible");
    expect(setClientFeature).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid body (enabled not boolean)", async () => {
    vi.mocked(requireOwner).mockResolvedValue(mockResult as never);
    vi.mocked(isTestModeEligible).mockReturnValue(true);

    const res = await POST(postReq({ enabled: "yes" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_error");
  });

  it("returns 400 for null/invalid JSON body", async () => {
    vi.mocked(requireOwner).mockResolvedValue(mockResult as never);
    vi.mocked(isTestModeEligible).mockReturnValue(true);

    const badReq = new Request("http://localhost/api/v1/client/test-mode", {
      method: "POST",
      body: "not-json",
    });
    const res = await POST(badReq);
    expect(res.status).toBe(400);
  });

  it("enables test mode and returns ok for eligible owner", async () => {
    vi.mocked(requireOwner).mockResolvedValue(mockResult as never);
    vi.mocked(isTestModeEligible).mockReturnValue(true);
    vi.mocked(setClientFeature).mockResolvedValue(undefined as never);

    const res = await POST(postReq({ enabled: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, enabled: true });
    expect(setClientFeature).toHaveBeenCalledWith("client-1", TEST_MODE_KEY, true);
  });

  it("disables test mode and returns ok for eligible owner", async () => {
    vi.mocked(requireOwner).mockResolvedValue(mockResult as never);
    vi.mocked(isTestModeEligible).mockReturnValue(true);
    vi.mocked(setClientFeature).mockResolvedValue(undefined as never);

    const res = await POST(postReq({ enabled: false }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, enabled: false });
    expect(setClientFeature).toHaveBeenCalledWith("client-1", TEST_MODE_KEY, false);
  });
});
