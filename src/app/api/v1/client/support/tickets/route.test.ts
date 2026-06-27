import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";
import { ZodError } from "zod";

vi.mock("@/lib/auth/session", () => ({
  requireClient: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/support", () => ({
  listTickets: vi.fn(),
  createTicket: vi.fn(),
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

import { GET, POST } from "./route";
import { requireClient } from "@/lib/auth/session";
import { listTickets, createTicket, SupportError } from "@/lib/modules/support";

beforeEach(() => {
  vi.clearAllMocks();
});

const mockResult = {
  ctx: { userId: "user-1", email: "owner@test.com" },
  client: { id: "client-1" },
  role: "owner",
  permissions: [],
};

describe("GET /api/v1/client/support/tickets", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireClient).mockRejectedValue(new AuthError(401));
    const res = await GET();
    expect(res.status).toBe(401);
    expect(listTickets).not.toHaveBeenCalled();
  });

  it("returns tickets on success", async () => {
    vi.mocked(requireClient).mockResolvedValue(mockResult as never);
    const tickets = [{ id: "t1", subject: "Help" }];
    vi.mocked(listTickets).mockResolvedValue(tickets as never);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ tickets });
    expect(listTickets).toHaveBeenCalledWith("client-1");
  });
});

describe("POST /api/v1/client/support/tickets", () => {
  const postReq = (body: unknown) =>
    new Request("http://localhost/api/v1/client/support/tickets", {
      method: "POST",
      body: JSON.stringify(body),
    });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireClient).mockRejectedValue(new AuthError(401));
    const res = await POST(postReq({ subject: "Test", message: "Help me" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when createTicket throws a ZodError", async () => {
    vi.mocked(requireClient).mockResolvedValue(mockResult as never);
    vi.mocked(createTicket).mockRejectedValue(
      new ZodError([{ code: "too_small", minimum: 1, origin: "string", inclusive: true, message: "Required", path: ["subject"] }] as never)
    );

    const res = await POST(postReq({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_error");
  });

  it("returns SupportError status when service throws", async () => {
    vi.mocked(requireClient).mockResolvedValue(mockResult as never);
    vi.mocked(createTicket).mockRejectedValue(new SupportError(429, "ticket_limit_reached"));

    const res = await POST(postReq({ subject: "Test", message: "Help" }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("ticket_limit_reached");
  });

  it("creates a ticket and returns 201 on success", async () => {
    vi.mocked(requireClient).mockResolvedValue(mockResult as never);
    const ticket = { id: "t1", subject: "Test", status: "open" };
    vi.mocked(createTicket).mockResolvedValue(ticket as never);

    const res = await POST(postReq({ subject: "Test", message: "Help" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ ticket });
    expect(createTicket).toHaveBeenCalledWith("client-1", "user-1", { subject: "Test", message: "Help" });
  });
});
