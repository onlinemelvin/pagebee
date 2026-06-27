import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireOwner: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/auth/policy", () => ({
  assertFeature: vi.fn(),
}));
vi.mock("@/lib/modules/email", () => ({
  getSendingDomain: vi.fn(),
  provisionSendingDomain: vi.fn(),
  checkSendingDomain: vi.fn(),
  removeSendingDomain: vi.fn(),
  SendingDomainError: class SendingDomainError extends Error {
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
import { requireOwner } from "@/lib/auth/session";
import { assertFeature } from "@/lib/auth/policy";
import { getSendingDomain, provisionSendingDomain, checkSendingDomain, removeSendingDomain, SendingDomainError } from "@/lib/modules/email";

beforeEach(() => {
  vi.clearAllMocks();
});

const mockClient = {
  id: "client-1",
  status: "active",
  subscription: { status: "ACTIVE", plan: { featureFlags: { customDomain: true } } },
};

const mockResult = {
  ctx: { userId: "user-1", email: "owner@test.com" },
  client: mockClient,
  role: "owner",
  permissions: [],
};

describe("GET /api/v1/client/email-domain", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(401));
    const res = (await GET()) as Response;
    expect(res.status).toBe(401);
    expect(getSendingDomain).not.toHaveBeenCalled();
  });

  it("returns 403 when not owner", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(403));
    const res = (await GET()) as Response;
    expect(res.status).toBe(403);
  });

  it("returns 403 when feature not in plan", async () => {
    vi.mocked(requireOwner).mockResolvedValue(mockResult as never);
    vi.mocked(assertFeature).mockImplementation(() => { throw new AuthError(403, "feature_not_in_plan"); });
    const res = (await GET()) as Response;
    expect(res.status).toBe(403);
    expect(getSendingDomain).not.toHaveBeenCalled();
  });

  it("returns sendingDomain on success", async () => {
    vi.mocked(requireOwner).mockResolvedValue(mockResult as never);
    vi.mocked(assertFeature).mockReturnValue(undefined);
    const domain = { id: "sd-1", domain: "mail.example.com", status: "pending" };
    vi.mocked(getSendingDomain).mockResolvedValue(domain as never);

    const res = (await GET()) as Response;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ sendingDomain: domain });
    expect(getSendingDomain).toHaveBeenCalledWith("client-1");
  });
});

describe("POST /api/v1/client/email-domain", () => {
  const postReq = (action?: string) =>
    new Request(`http://localhost/api/v1/client/email-domain${action ? `?action=${action}` : ""}`, {
      method: "POST",
    });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(401));
    const res = (await POST(postReq())) as Response;
    expect(res.status).toBe(401);
  });

  it("returns 403 when feature not in plan", async () => {
    vi.mocked(requireOwner).mockResolvedValue(mockResult as never);
    vi.mocked(assertFeature).mockImplementation(() => { throw new AuthError(403, "feature_not_in_plan"); });
    const res = (await POST(postReq())) as Response;
    expect(res.status).toBe(403);
  });

  it("provisions a sending domain (default action) and returns 201", async () => {
    vi.mocked(requireOwner).mockResolvedValue(mockResult as never);
    vi.mocked(assertFeature).mockReturnValue(undefined);
    const domain = { id: "sd-1", domain: "mail.example.com", status: "pending" };
    vi.mocked(provisionSendingDomain).mockResolvedValue(domain as never);

    const res = (await POST(postReq())) as Response;
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ sendingDomain: domain });
    expect(provisionSendingDomain).toHaveBeenCalledWith("client-1");
  });

  it("removes the sending domain when action=remove", async () => {
    vi.mocked(requireOwner).mockResolvedValue(mockResult as never);
    vi.mocked(assertFeature).mockReturnValue(undefined);
    vi.mocked(removeSendingDomain).mockResolvedValue(undefined as never);

    const res = (await POST(postReq("remove"))) as Response;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(removeSendingDomain).toHaveBeenCalledWith("client-1");
  });

  it("returns 404 when verifying a domain that is not provisioned", async () => {
    vi.mocked(requireOwner).mockResolvedValue(mockResult as never);
    vi.mocked(assertFeature).mockReturnValue(undefined);
    vi.mocked(getSendingDomain).mockResolvedValue(null as never);

    const res = (await POST(postReq("verify"))) as Response;
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_provisioned");
  });

  it("verifies the domain and returns updated status", async () => {
    vi.mocked(requireOwner).mockResolvedValue(mockResult as never);
    vi.mocked(assertFeature).mockReturnValue(undefined);
    const existing = { id: "sd-1", domain: "mail.example.com", status: "pending" };
    const updated = { ...existing, status: "verified" };
    vi.mocked(getSendingDomain).mockResolvedValue(existing as never);
    vi.mocked(checkSendingDomain).mockResolvedValue(updated as never);

    const res = (await POST(postReq("verify"))) as Response;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ sendingDomain: updated });
    expect(checkSendingDomain).toHaveBeenCalledWith("sd-1");
  });

  it("returns SendingDomainError status on domain error", async () => {
    vi.mocked(requireOwner).mockResolvedValue(mockResult as never);
    vi.mocked(assertFeature).mockReturnValue(undefined);
    vi.mocked(provisionSendingDomain).mockRejectedValue(new SendingDomainError(409, "already_exists"));

    const res = (await POST(postReq())) as Response;
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("already_exists");
  });
});
