import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireOwner: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/payments", () => ({
  completeOAuth: vi.fn(),
  verifyConnectState: vi.fn(),
}));
vi.mock("@/lib/stripe/client", () => ({
  appBaseUrl: vi.fn(() => "https://app.pagebee.com"),
}));

import { GET } from "./route";
import { requireOwner } from "@/lib/auth/session";
import { completeOAuth, verifyConnectState } from "@/lib/modules/payments";
import { appBaseUrl } from "@/lib/stripe/client";

const makeOwner = (clientId = "c1") => ({
  client: { id: clientId },
  ctx: { userId: "u1" },
  role: "owner",
  permissions: [],
});

const req = (qs = "") =>
  new Request(`http://localhost/api/v1/client/payments/connect/oauth${qs}`);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(appBaseUrl).mockReturnValue("https://app.pagebee.com");
});

describe("GET /api/v1/client/payments/connect/oauth", () => {
  it("redirects to /login when not authenticated", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(401));
    const res = await GET(req("?code=xyz&state=abc"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://app.pagebee.com/login");
    expect(completeOAuth).not.toHaveBeenCalled();
  });

  it("redirects to /login when caller is not owner (403)", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(403));
    const res = await GET(req("?code=xyz&state=abc"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://app.pagebee.com/login");
  });

  it("redirects to error page when code is missing", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner() as never);
    vi.mocked(verifyConnectState).mockReturnValue(true);

    const res = await GET(req("?state=abc"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://app.pagebee.com/client/invoices/settings?connect=error",
    );
    expect(completeOAuth).not.toHaveBeenCalled();
  });

  it("redirects to error page when state is missing", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner() as never);
    vi.mocked(verifyConnectState).mockReturnValue(true);

    const res = await GET(req("?code=xyz"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://app.pagebee.com/client/invoices/settings?connect=error",
    );
    expect(completeOAuth).not.toHaveBeenCalled();
  });

  it("redirects to error page when state verification fails", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner("c-verify") as never);
    vi.mocked(verifyConnectState).mockReturnValue(false);

    const res = await GET(req("?code=xyz&state=bad-state"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://app.pagebee.com/client/invoices/settings?connect=error",
    );
    expect(verifyConnectState).toHaveBeenCalledWith("bad-state", "c-verify");
    expect(completeOAuth).not.toHaveBeenCalled();
  });

  it("calls completeOAuth and redirects to done on success", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner("c-oauth") as never);
    vi.mocked(verifyConnectState).mockReturnValue(true);
    vi.mocked(completeOAuth).mockResolvedValue(undefined as never);

    const res = await GET(req("?code=auth_code&state=valid_state"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://app.pagebee.com/client/invoices/settings?connect=done",
    );
    expect(completeOAuth).toHaveBeenCalledWith("c-oauth", "auth_code");
  });

  it("redirects to error page when completeOAuth throws", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner() as never);
    vi.mocked(verifyConnectState).mockReturnValue(true);
    vi.mocked(completeOAuth).mockRejectedValue(new Error("stripe error"));

    const res = await GET(req("?code=auth_code&state=valid_state"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://app.pagebee.com/client/invoices/settings?connect=error",
    );
  });
});
