import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireCapability: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/lead", () => ({
  updateLead: vi.fn(),
  leadUpdateSchema: {
    safeParse: vi.fn(),
  },
}));
// prismaMock from global setup covers @/lib/db

import { PATCH } from "./route";
import { requireCapability } from "@/lib/auth/session";
import { updateLead, leadUpdateSchema } from "@/lib/modules/lead";
import { prismaMock } from "@/test/setup";

const makeCtx = (clientId = "client-1") => ({
  ctx: { userId: "user-1" },
  client: { id: clientId },
  role: "owner",
  permissions: [],
});

const makeParams = (id = "lead-1") => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/v1/client/leads/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await PATCH(
      new Request("http://localhost/", { method: "PATCH", body: JSON.stringify({ status: "READ" }) }),
      makeParams(),
    );
    expect(res.status).toBe(401);
    expect(updateLead).not.toHaveBeenCalled();
  });

  it("returns 403 when lacking inquiries:manage", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(403));
    const res = await PATCH(
      new Request("http://localhost/", { method: "PATCH", body: JSON.stringify({ status: "READ" }) }),
      makeParams(),
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when lead doesn't belong to the caller's tenant", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx("real-tenant") as never);
    prismaMock.lead.findFirst.mockResolvedValue(null);
    vi.mocked(leadUpdateSchema.safeParse).mockReturnValue({ success: true, data: {} } as never);

    const res = await PATCH(
      new Request("http://localhost/", { method: "PATCH", body: JSON.stringify({ status: "READ" }) }),
      makeParams("other-tenant-lead"),
    );
    expect(res.status).toBe(404);
    // confirms tenant-scoped ownership check
    expect(prismaMock.lead.findFirst).toHaveBeenCalledWith({
      where: { id: "other-tenant-lead", clientId: "real-tenant" },
      select: { id: true },
    });
  });

  it("returns 400 when body fails schema validation", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);
    prismaMock.lead.findFirst.mockResolvedValue({ id: "lead-1" } as never);
    vi.mocked(leadUpdateSchema.safeParse).mockReturnValue({
      success: false,
      error: { flatten: () => ({ fieldErrors: {}, formErrors: [] }) },
    } as never);

    const res = await PATCH(
      new Request("http://localhost/", { method: "PATCH", body: JSON.stringify({ status: "INVALID" }) }),
      makeParams("lead-1"),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "validation_error" });
  });

  it("returns 200 with updated lead, scoped by guard clientId", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx("t-99") as never);
    prismaMock.lead.findFirst.mockResolvedValue({ id: "lead-1" } as never);
    vi.mocked(leadUpdateSchema.safeParse).mockReturnValue({
      success: true,
      data: { status: "READ" },
    } as never);
    const lead = { id: "lead-1", status: "READ" };
    vi.mocked(updateLead).mockResolvedValue(lead as never);

    const res = await PATCH(
      new Request("http://localhost/", { method: "PATCH", body: JSON.stringify({ status: "READ" }) }),
      makeParams("lead-1"),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ lead });
    expect(updateLead).toHaveBeenCalledWith("lead-1", { status: "READ" }, { userId: "user-1" }, "t-99");
  });
});
