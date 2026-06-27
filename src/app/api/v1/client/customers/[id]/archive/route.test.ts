import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireCapability: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/customer", () => ({
  setCustomerArchived: vi.fn(),
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
import { setCustomerArchived, CustomerError } from "@/lib/modules/customer";

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

describe("POST /api/v1/client/customers/[id]/archive", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await POST(
      new Request("http://localhost/", { method: "POST", body: JSON.stringify({ archived: true }) }),
      makeParams(),
    );
    expect(res.status).toBe(401);
    expect(setCustomerArchived).not.toHaveBeenCalled();
  });

  it("returns 403 when lacking customers:manage", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(403));
    const res = await POST(
      new Request("http://localhost/", { method: "POST", body: JSON.stringify({ archived: true }) }),
      makeParams(),
    );
    expect(res.status).toBe(403);
  });

  it("archives the customer when archived=true", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx("t-99") as never);
    const customer = { id: "cust-1", archived: true };
    vi.mocked(setCustomerArchived).mockResolvedValue(customer as never);

    const res = await POST(
      new Request("http://localhost/", { method: "POST", body: JSON.stringify({ archived: true }) }),
      makeParams("cust-1"),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ customer });
    expect(setCustomerArchived).toHaveBeenCalledWith("t-99", "cust-1", true, { userId: "user-1" });
  });

  it("unarchives the customer when archived=false", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);
    vi.mocked(setCustomerArchived).mockResolvedValue({ id: "cust-1", archived: false } as never);

    await POST(
      new Request("http://localhost/", { method: "POST", body: JSON.stringify({ archived: false }) }),
      makeParams("cust-1"),
    );
    expect(setCustomerArchived).toHaveBeenCalledWith("client-1", "cust-1", false, { userId: "user-1" });
  });

  it("defaults to archiving (true) when archived is missing from body", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);
    vi.mocked(setCustomerArchived).mockResolvedValue({ id: "cust-1" } as never);

    await POST(
      new Request("http://localhost/", { method: "POST", body: JSON.stringify({}) }),
      makeParams("cust-1"),
    );
    expect(setCustomerArchived).toHaveBeenCalledWith("client-1", "cust-1", true, { userId: "user-1" });
  });

  it("returns CustomerError status when service throws", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);
    vi.mocked(setCustomerArchived).mockRejectedValue(new CustomerError("not_found", 404));

    const res = await POST(
      new Request("http://localhost/", { method: "POST", body: JSON.stringify({ archived: true }) }),
      makeParams("missing"),
    );
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: "not_found" });
  });
});
