import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireClient: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/support", () => ({
  getTicket: vi.fn(),
  SupportError: class SupportError extends Error {
    code: string;
    status: number;
    constructor(status: number, code: string) {
      super(code);
      this.status = status;
      this.code = code;
    }
  },
}));

import { GET } from "./route";
import { requireClient } from "@/lib/auth/session";
import { getTicket, SupportError } from "@/lib/modules/support";

const params = (id = "t-1") => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
});

const mockResult = {
  ctx: { userId: "user-1", email: "owner@test.com" },
  client: { id: "client-1" },
  role: "owner",
  permissions: [],
};

describe("GET /api/v1/client/support/tickets/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireClient).mockRejectedValue(new AuthError(401));
    const res = await GET(new Request("http://localhost/api/v1/client/support/tickets/t-1"), params());
    expect(res.status).toBe(401);
    expect(getTicket).not.toHaveBeenCalled();
  });

  it("returns SupportError status when ticket not found", async () => {
    vi.mocked(requireClient).mockResolvedValue(mockResult as never);
    vi.mocked(getTicket).mockRejectedValue(new SupportError(404, "not_found"));

    const res = await GET(new Request("http://localhost/api/v1/client/support/tickets/t-1"), params("t-1"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
  });

  it("returns the ticket on success", async () => {
    vi.mocked(requireClient).mockResolvedValue(mockResult as never);
    const ticket = { id: "t-1", subject: "Help", status: "open", comments: [] };
    vi.mocked(getTicket).mockResolvedValue(ticket as never);

    const res = await GET(new Request("http://localhost/api/v1/client/support/tickets/t-1"), params("t-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ticket });
    expect(getTicket).toHaveBeenCalledWith("client-1", "t-1");
  });
});
