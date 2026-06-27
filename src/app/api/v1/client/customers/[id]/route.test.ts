import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireCapability: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/customer", () => ({
  getCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  deleteCustomer: vi.fn(),
  CustomerError: class CustomerError extends Error {
    constructor(
      public code: string,
      public status = 400,
    ) {
      super(code);
    }
  },
}));

import { GET, PATCH, DELETE } from "./route";
import { requireCapability } from "@/lib/auth/session";
import { getCustomer, updateCustomer, deleteCustomer, CustomerError } from "@/lib/modules/customer";

const makeCtx = (clientId = "client-1") => ({
  ctx: { userId: "user-1" },
  client: { id: clientId },
  role: "owner",
  permissions: [],
});

const makeParams = (id = "cust-1") => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/client/customers/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await GET(new Request("http://localhost/"), makeParams());
    expect(res.status).toBe(401);
    expect(getCustomer).not.toHaveBeenCalled();
  });

  it("returns 403 when lacking customers:view", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(403));
    const res = await GET(new Request("http://localhost/"), makeParams());
    expect(res.status).toBe(403);
  });

  it("returns 404 when customer not found", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);
    vi.mocked(getCustomer).mockResolvedValue(null as never);

    const res = await GET(new Request("http://localhost/"), makeParams("missing"));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: "not_found" });
  });

  it("returns 200 with customer, scoped by guard clientId", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx("t-99") as never);
    const customer = { id: "cust-1", name: "Alice" };
    vi.mocked(getCustomer).mockResolvedValue(customer as never);

    const res = await GET(new Request("http://localhost/"), makeParams("cust-1"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ customer });
    expect(getCustomer).toHaveBeenCalledWith("t-99", "cust-1");
  });
});

describe("PATCH /api/v1/client/customers/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await PATCH(
      new Request("http://localhost/", { method: "PATCH", body: JSON.stringify({ name: "Bob" }) }),
      makeParams(),
    );
    expect(res.status).toBe(401);
    expect(updateCustomer).not.toHaveBeenCalled();
  });

  it("returns 403 when lacking customers:manage", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(403));
    const res = await PATCH(
      new Request("http://localhost/", { method: "PATCH", body: JSON.stringify({ name: "Bob" }) }),
      makeParams(),
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 on ZodError from service", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);
    const { ZodError, z } = await import("zod");
    const result = z.object({ email: z.string().email() }).safeParse({ email: "not-an-email" });
    vi.mocked(updateCustomer).mockRejectedValue(
      new ZodError((result as unknown as { error: { issues: [] } }).error.issues),
    );

    const res = await PATCH(
      new Request("http://localhost/", { method: "PATCH", body: JSON.stringify({ email: "bad" }) }),
      makeParams(),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "validation_error" });
  });

  it("returns 200 with updated customer, scoped by guard clientId", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx("t-99") as never);
    const customer = { id: "cust-1", name: "Bob" };
    vi.mocked(updateCustomer).mockResolvedValue(customer as never);

    const res = await PATCH(
      new Request("http://localhost/", { method: "PATCH", body: JSON.stringify({ name: "Bob" }) }),
      makeParams("cust-1"),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ customer });
    expect(updateCustomer).toHaveBeenCalledWith("t-99", "cust-1", expect.anything(), { userId: "user-1" });
  });
});

describe("DELETE /api/v1/client/customers/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await DELETE(new Request("http://localhost/", { method: "DELETE" }), makeParams());
    expect(res.status).toBe(401);
    expect(deleteCustomer).not.toHaveBeenCalled();
  });

  it("returns 403 when lacking customers:manage", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(403));
    const res = await DELETE(new Request("http://localhost/", { method: "DELETE" }), makeParams());
    expect(res.status).toBe(403);
  });

  it("returns CustomerError status when service throws", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);
    vi.mocked(deleteCustomer).mockRejectedValue(new CustomerError("has_invoices", 409));

    const res = await DELETE(new Request("http://localhost/", { method: "DELETE" }), makeParams("cust-1"));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: "has_invoices" });
  });

  it("returns 200 ok on success, scoped by guard clientId", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx("t-99") as never);
    vi.mocked(deleteCustomer).mockResolvedValue(undefined as never);

    const res = await DELETE(new Request("http://localhost/", { method: "DELETE" }), makeParams("cust-1"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(deleteCustomer).toHaveBeenCalledWith("t-99", "cust-1", { userId: "user-1" });
  });
});
