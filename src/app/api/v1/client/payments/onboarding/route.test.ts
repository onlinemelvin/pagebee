import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";
import { ZodError, z } from "zod";

vi.mock("@/lib/auth/session", () => ({
  requireOwner: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/payments", () => ({
  submitOnboarding: vi.fn(),
  getOnboardingState: vi.fn(),
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
vi.mock("@/lib/posthog-server", () => ({
  getPostHogClient: vi.fn(() => ({ capture: vi.fn() })),
}));

import { GET, POST } from "./route";
import { requireOwner } from "@/lib/auth/session";
import { submitOnboarding, getOnboardingState, PaymentError } from "@/lib/modules/payments";
import { getPostHogClient } from "@/lib/posthog-server";

const makeOwner = (clientId = "c1") => ({
  client: { id: clientId },
  ctx: { userId: "u1" },
  role: "owner",
  permissions: [],
});

const postReq = (body: unknown) =>
  new Request("http://localhost/api/v1/client/payments/onboarding", {
    method: "POST",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPostHogClient).mockReturnValue({ capture: vi.fn() } as never);
});

describe("GET /api/v1/client/payments/onboarding", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(401));
    const res = await GET();
    expect(res.status).toBe(401);
    expect(getOnboardingState).not.toHaveBeenCalled();
  });

  it("returns 403 when caller is not owner", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(403));
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns onboarding state for client from guard", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner("c-onboard") as never);
    vi.mocked(getOnboardingState).mockResolvedValue({ status: "pending" } as never);

    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ state: { status: "pending" } });
    expect(getOnboardingState).toHaveBeenCalledWith("c-onboard");
  });
});

describe("POST /api/v1/client/payments/onboarding", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(401));
    const res = await POST(postReq({}));
    expect(res.status).toBe(401);
    expect(submitOnboarding).not.toHaveBeenCalled();
  });

  it("returns 403 when caller is not owner", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(403));
    const res = await POST(postReq({}));
    expect(res.status).toBe(403);
  });

  it("calls submitOnboarding with clientId from guard and returns state", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner("c-submit") as never);
    vi.mocked(submitOnboarding).mockResolvedValue("complete" as never);

    const body = { businessName: "Acme", businessType: "individual" };
    const res = await POST(postReq(body));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ state: "complete" });
    expect(submitOnboarding).toHaveBeenCalledWith("c-submit", body, null);
  });

  it("returns 400 with issues when submitOnboarding throws ZodError", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner() as never);
    // Build a ZodError via parse so the issue shape matches the current Zod version
    const zodErr = (() => {
      try {
        z.object({ businessName: z.string() }).parse({});
      } catch (e) {
        return e as ZodError;
      }
    })()!;
    vi.mocked(submitOnboarding).mockRejectedValue(zodErr);

    const res = await POST(postReq({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ error: "validation_error" });
    expect(body.issues).toBeDefined();
  });

  it("returns PaymentError status on payment failure", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner() as never);
    vi.mocked(submitOnboarding).mockRejectedValue(new PaymentError(404, "account_not_found"));

    const res = await POST(postReq({}));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: "account_not_found" });
  });

  it("returns 400 stripe_error with message for other Errors", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner() as never);
    vi.mocked(submitOnboarding).mockRejectedValue(new Error("Invalid routing number"));

    const res = await POST(postReq({}));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "stripe_error", message: "Invalid routing number" });
  });
});
