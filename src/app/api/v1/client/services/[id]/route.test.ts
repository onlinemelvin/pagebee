import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireCapability: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/service", () => ({
  updateService: vi.fn(),
  deleteService: vi.fn(),
  ServiceError: class ServiceError extends Error {
    constructor(
      public status: number,
      public code: string,
    ) {
      super(code);
    }
  },
}));

import { PATCH, DELETE } from "./route";
import { requireCapability } from "@/lib/auth/session";
import { updateService, deleteService, ServiceError } from "@/lib/modules/service";

const makeCtx = (clientId = "client-1") => ({
  ctx: { userId: "user-1" },
  client: { id: clientId },
  role: "owner",
  permissions: [],
});

const makeParams = (id = "svc-1") => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/v1/client/services/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await PATCH(
      new Request("http://localhost/", { method: "PATCH", body: JSON.stringify({ name: "Color" }) }),
      makeParams(),
    );
    expect(res.status).toBe(401);
    expect(updateService).not.toHaveBeenCalled();
  });

  it("returns 403 when lacking website:manage", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(403));
    const res = await PATCH(
      new Request("http://localhost/", { method: "PATCH", body: JSON.stringify({ name: "Color" }) }),
      makeParams(),
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 on ZodError from service", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);
    const { ZodError, z } = await import("zod");
    const result = z.object({ price: z.number() }).safeParse({ price: "not-a-number" });
    vi.mocked(updateService).mockRejectedValue(
      new ZodError((result as unknown as { error: { issues: [] } }).error.issues),
    );

    const res = await PATCH(
      new Request("http://localhost/", { method: "PATCH", body: JSON.stringify({ price: "bad" }) }),
      makeParams(),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "validation_error" });
  });

  it("returns ServiceError status when service throws", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);
    vi.mocked(updateService).mockRejectedValue(new ServiceError(404, "service_not_found"));

    const res = await PATCH(
      new Request("http://localhost/", { method: "PATCH", body: JSON.stringify({ name: "Color" }) }),
      makeParams("missing"),
    );
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: "service_not_found" });
  });

  it("returns 200 with updated service, scoped by guard clientId", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx("t-99") as never);
    const service = { id: "svc-1", name: "Color" };
    vi.mocked(updateService).mockResolvedValue(service as never);

    const res = await PATCH(
      new Request("http://localhost/", { method: "PATCH", body: JSON.stringify({ name: "Color" }) }),
      makeParams("svc-1"),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ service });
    expect(updateService).toHaveBeenCalledWith("t-99", "svc-1", expect.anything());
  });
});

describe("DELETE /api/v1/client/services/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await DELETE(new Request("http://localhost/", { method: "DELETE" }), makeParams());
    expect(res.status).toBe(401);
    expect(deleteService).not.toHaveBeenCalled();
  });

  it("returns 403 when lacking website:manage", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(403));
    const res = await DELETE(new Request("http://localhost/", { method: "DELETE" }), makeParams());
    expect(res.status).toBe(403);
  });

  it("returns ServiceError status when service throws (e.g. deleting the default)", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);
    vi.mocked(deleteService).mockRejectedValue(new ServiceError(400, "cannot_delete_default"));

    const res = await DELETE(new Request("http://localhost/", { method: "DELETE" }), makeParams("svc-other"));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "cannot_delete_default" });
  });

  it("returns 200 ok on success, scoped by guard clientId", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx("t-99") as never);
    vi.mocked(deleteService).mockResolvedValue(undefined as never);

    const res = await DELETE(new Request("http://localhost/", { method: "DELETE" }), makeParams("svc-1"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(deleteService).toHaveBeenCalledWith("t-99", "svc-1");
  });
});
