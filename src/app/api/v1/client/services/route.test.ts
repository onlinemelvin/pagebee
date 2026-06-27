import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireCapability: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/service", () => ({
  listServices: vi.fn(),
  createService: vi.fn(),
  ServiceError: class ServiceError extends Error {
    constructor(
      public status: number,
      public code: string,
    ) {
      super(code);
    }
  },
}));

import { GET, POST } from "./route";
import { requireCapability } from "@/lib/auth/session";
import { listServices, createService, ServiceError } from "@/lib/modules/service";

const makeCtx = (clientId = "client-1") => ({
  ctx: { userId: "user-1" },
  client: { id: clientId },
  role: "owner",
  permissions: [],
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/client/services", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await GET();
    expect(res.status).toBe(401);
    expect(listServices).not.toHaveBeenCalled();
  });

  it("returns 403 when lacking website:view", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(403));
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 200 with services, scoped by guard clientId", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx("t-99") as never);
    const services = [{ id: "svc-1", name: "Haircut" }];
    vi.mocked(listServices).mockResolvedValue(services as never);

    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ services });
    expect(listServices).toHaveBeenCalledWith("t-99");
  });
});

describe("POST /api/v1/client/services", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await POST(
      new Request("http://localhost/", { method: "POST", body: JSON.stringify({ name: "Haircut" }) }),
    );
    expect(res.status).toBe(401);
    expect(createService).not.toHaveBeenCalled();
  });

  it("returns 403 when lacking website:manage", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(403));
    const res = await POST(
      new Request("http://localhost/", { method: "POST", body: JSON.stringify({ name: "Haircut" }) }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 on ZodError from service", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);
    const { ZodError, z } = await import("zod");
    const result = z.object({ name: z.string().min(100) }).safeParse({ name: "x" });
    vi.mocked(createService).mockRejectedValue(
      new ZodError((result as unknown as { error: { issues: [] } }).error.issues),
    );

    const res = await POST(
      new Request("http://localhost/", { method: "POST", body: JSON.stringify({ name: "x" }) }),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "validation_error" });
  });

  it("returns ServiceError status when service throws", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);
    vi.mocked(createService).mockRejectedValue(new ServiceError(409, "duplicate_service"));

    const res = await POST(
      new Request("http://localhost/", { method: "POST", body: JSON.stringify({ name: "Haircut" }) }),
    );
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: "duplicate_service" });
  });

  it("returns 201 with service on success, scoped by guard clientId", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx("t-99") as never);
    const service = { id: "svc-1", name: "Haircut" };
    vi.mocked(createService).mockResolvedValue(service as never);

    const res = await POST(
      new Request("http://localhost/", { method: "POST", body: JSON.stringify({ name: "Haircut" }) }),
    );
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ service });
    expect(createService).toHaveBeenCalledWith("t-99", expect.anything());
  });
});
