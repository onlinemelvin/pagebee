import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireOwner: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/payments", () => ({
  startConnect: vi.fn(),
  PaymentError: class PaymentError extends Error {
    code: string;
    status: number;
    constructor(status: number, code: string) {
      super(code);
      this.status = status;
      this.code = code;
    }
  },
}));
vi.mock("@/lib/stripe/client", () => ({
  appBaseUrl: vi.fn(() => "https://app.pagebee.com"),
}));

import { GET } from "./route";
import { requireOwner } from "@/lib/auth/session";
import { startConnect, PaymentError } from "@/lib/modules/payments";
import { appBaseUrl } from "@/lib/stripe/client";

const makeOwner = (clientId = "c1") => ({
  client: { id: clientId },
  ctx: { userId: "u1" },
  role: "owner",
  permissions: [],
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(appBaseUrl).mockReturnValue("https://app.pagebee.com");
});

describe("GET /api/v1/client/payments/connect", () => {
  it("redirects to /login when not authenticated", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(401));
    const res = await GET();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://app.pagebee.com/login");
    expect(startConnect).not.toHaveBeenCalled();
  });

  it("redirects to /login when caller is not owner (403)", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(403));
    const res = await GET();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://app.pagebee.com/login");
  });

  it("redirects to Stripe Connect URL on success", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner("c-connect") as never);
    vi.mocked(startConnect).mockResolvedValue("https://connect.stripe.com/oauth/authorize?state=abc" as never);

    const res = await GET();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://connect.stripe.com/oauth/authorize?state=abc");
    expect(startConnect).toHaveBeenCalledWith("c-connect");
  });

  it("redirects to settings error page when startConnect throws PaymentError", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner() as never);
    vi.mocked(startConnect).mockRejectedValue(new PaymentError(503, "no_stripe_key"));

    const res = await GET();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://app.pagebee.com/client/invoices/settings?connect=no_stripe_key",
    );
  });

  it("redirects to settings with generic error when startConnect throws non-PaymentError", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner() as never);
    vi.mocked(startConnect).mockRejectedValue(new Error("unknown"));

    const res = await GET();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://app.pagebee.com/client/invoices/settings?connect=error",
    );
  });
});
