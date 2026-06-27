import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireCapability: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/customer", () => ({
  createCustomer: vi.fn(),
  listCustomers: vi.fn(),
  customerCounts: vi.fn(),
  CustomerError: class CustomerError extends Error {
    constructor(
      public code: string,
      public status = 400,
    ) {
      super(code);
    }
  },
}));

import { GET, POST } from "./route";
import { requireCapability } from "@/lib/auth/session";
import { createCustomer, listCustomers, customerCounts, CustomerError } from "@/lib/modules/customer";

const makeCtx = (clientId = "client-1") => ({
  ctx: { userId: "user-1" },
  client: { id: clientId },
  role: "owner",
  permissions: [],
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/client/customers", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await GET(new Request("http://localhost/api/v1/client/customers"));
    expect(res.status).toBe(401);
    expect(listCustomers).not.toHaveBeenCalled();
  });

  it("returns 403 when lacking customers:view capability", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(403));
    const res = await GET(new Request("http://localhost/api/v1/client/customers"));
    expect(res.status).toBe(403);
  });

  it("passes search and archived params to listCustomers scoped by guard clientId", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);
    vi.mocked(listCustomers).mockResolvedValue([] as never);
    vi.mocked(customerCounts).mockResolvedValue({ active: 2, archived: 1 } as never);

    await GET(new Request("http://localhost/api/v1/client/customers?q=alice&archived=1"));
    expect(listCustomers).toHaveBeenCalledWith("client-1", { search: "alice", archived: true });
    expect(customerCounts).toHaveBeenCalledWith("client-1");
  });

  it("treats archived=0 as false", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);
    vi.mocked(listCustomers).mockResolvedValue([] as never);
    vi.mocked(customerCounts).mockResolvedValue({ active: 0, archived: 0 } as never);

    await GET(new Request("http://localhost/api/v1/client/customers?archived=0"));
    expect(listCustomers).toHaveBeenCalledWith("client-1", { search: undefined, archived: false });
  });

  it("returns 200 with customers and counts", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);
    const customers = [{ id: "c1", name: "Alice" }];
    const counts = { active: 1, archived: 0 };
    vi.mocked(listCustomers).mockResolvedValue(customers as never);
    vi.mocked(customerCounts).mockResolvedValue(counts as never);

    const res = await GET(new Request("http://localhost/api/v1/client/customers"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ customers, counts });
  });

  it("uses the guard's clientId, not anything from the body (IDOR guard)", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx("real-tenant") as never);
    vi.mocked(listCustomers).mockResolvedValue([] as never);
    vi.mocked(customerCounts).mockResolvedValue({ active: 0, archived: 0 } as never);

    await GET(new Request("http://localhost/api/v1/client/customers"));
    expect(listCustomers).toHaveBeenCalledWith("real-tenant", expect.anything());
  });
});

describe("POST /api/v1/client/customers", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await POST(
      new Request("http://localhost/api/v1/client/customers", {
        method: "POST",
        body: JSON.stringify({ name: "Alice" }),
      }),
    );
    expect(res.status).toBe(401);
    expect(createCustomer).not.toHaveBeenCalled();
  });

  it("returns 403 when lacking customers:manage capability", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(403));
    const res = await POST(
      new Request("http://localhost/api/v1/client/customers", {
        method: "POST",
        body: JSON.stringify({ name: "Alice" }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 on ZodError from service", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);
    const { ZodError, z } = await import("zod");
    const zodErr = z.object({ name: z.string().min(100) }).safeParse({ name: "x" });
    vi.mocked(createCustomer).mockRejectedValue(
      new ZodError((zodErr as unknown as { error: { issues: [] } }).error.issues),
    );

    const res = await POST(
      new Request("http://localhost/api/v1/client/customers", {
        method: "POST",
        body: JSON.stringify({ name: "x" }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_error");
  });

  it("returns 400 on CustomerError from service", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);
    vi.mocked(createCustomer).mockRejectedValue(new CustomerError("duplicate_email", 400));

    const res = await POST(
      new Request("http://localhost/api/v1/client/customers", {
        method: "POST",
        body: JSON.stringify({ name: "Alice", email: "a@b.com" }),
      }),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "duplicate_email" });
  });

  it("returns 201 with customer on success, scoped by guard clientId", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx("t-99") as never);
    const customer = { id: "cust-1", name: "Alice" };
    vi.mocked(createCustomer).mockResolvedValue(customer as never);

    const res = await POST(
      new Request("http://localhost/api/v1/client/customers", {
        method: "POST",
        body: JSON.stringify({ name: "Alice" }),
      }),
    );
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ customer });
    expect(createCustomer).toHaveBeenCalledWith("t-99", expect.anything(), { userId: "user-1" });
  });
});
