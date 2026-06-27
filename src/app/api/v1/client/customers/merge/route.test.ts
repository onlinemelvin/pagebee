import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireCapability: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/customer", () => ({
  mergeCustomers: vi.fn(),
  mergeInputSchema: {
    safeParse: vi.fn(),
  },
  CustomerError: class CustomerError extends Error {
    constructor(
      public code: string,
      public status = 400,
    ) {
      super(code);
    }
  },
}));

import { POST } from "./route";
import { requireCapability } from "@/lib/auth/session";
import { mergeCustomers, mergeInputSchema, CustomerError } from "@/lib/modules/customer";

const makeCtx = (clientId = "client-1") => ({
  ctx: { userId: "user-1" },
  client: { id: clientId },
  role: "owner",
  permissions: [],
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/client/customers/merge", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    vi.mocked(mergeInputSchema.safeParse).mockReturnValue({ success: true, data: { primaryId: "a", duplicateId: "b" } } as never);

    const res = await POST(
      new Request("http://localhost/api/v1/client/customers/merge", {
        method: "POST",
        body: JSON.stringify({ primaryId: "a", duplicateId: "b" }),
      }),
    );
    expect(res.status).toBe(401);
    expect(mergeCustomers).not.toHaveBeenCalled();
  });

  it("returns 403 when lacking customers:manage capability", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(403));
    vi.mocked(mergeInputSchema.safeParse).mockReturnValue({ success: true, data: { primaryId: "a", duplicateId: "b" } } as never);

    const res = await POST(
      new Request("http://localhost/api/v1/client/customers/merge", {
        method: "POST",
        body: JSON.stringify({ primaryId: "a", duplicateId: "b" }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 when body fails schema validation", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);
    vi.mocked(mergeInputSchema.safeParse).mockReturnValue({
      success: false,
      error: { flatten: () => ({ fieldErrors: {}, formErrors: [] }) },
    } as never);

    const res = await POST(
      new Request("http://localhost/api/v1/client/customers/merge", {
        method: "POST",
        body: JSON.stringify({ primaryId: "a" }), // missing duplicateId
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_error");
  });

  it("returns 400 on CustomerError from service", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);
    vi.mocked(mergeInputSchema.safeParse).mockReturnValue({
      success: true,
      data: { primaryId: "a", duplicateId: "b" },
    } as never);
    vi.mocked(mergeCustomers).mockRejectedValue(new CustomerError("not_found", 404));

    const res = await POST(
      new Request("http://localhost/api/v1/client/customers/merge", {
        method: "POST",
        body: JSON.stringify({ primaryId: "a", duplicateId: "b" }),
      }),
    );
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: "not_found" });
  });

  it("returns 200 with merged customer scoped to guard clientId", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx("t-abc") as never);
    vi.mocked(mergeInputSchema.safeParse).mockReturnValue({
      success: true,
      data: { primaryId: "a", duplicateId: "b" },
    } as never);
    const customer = { id: "a", name: "Alice" };
    vi.mocked(mergeCustomers).mockResolvedValue(customer as never);

    const res = await POST(
      new Request("http://localhost/api/v1/client/customers/merge", {
        method: "POST",
        body: JSON.stringify({ primaryId: "a", duplicateId: "b" }),
      }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ customer });
    expect(mergeCustomers).toHaveBeenCalledWith("t-abc", "a", "b", { userId: "user-1" });
  });
});
