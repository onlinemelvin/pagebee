import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireCapability: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/client", () => ({
  getClientWorkspace: vi.fn(),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));
// prismaMock from global setup covers @/lib/db

import { POST } from "./route";
import { requireCapability } from "@/lib/auth/session";
import { getClientWorkspace } from "@/lib/modules/client";
import { prismaMock } from "@/test/setup";

const makeCtx = (clientId = "client-1") => ({
  ctx: { userId: "user-1" },
  client: { id: clientId },
  role: "owner",
  permissions: [],
});

const makeWorkspace = (clientId = "client-1", hasForms = true) => ({
  client: { id: clientId },
  caps: { forms: hasForms },
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/client/lead-form", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await POST(
      new Request("http://localhost/", {
        method: "POST",
        body: JSON.stringify({ goal: "Request a quote" }),
      }),
    );
    expect(res.status).toBe(401);
    expect(getClientWorkspace).not.toHaveBeenCalled();
  });

  it("returns 403 when lacking inquiries:manage", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(403));
    const res = await POST(
      new Request("http://localhost/", {
        method: "POST",
        body: JSON.stringify({ goal: "Request a quote" }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when workspace is null", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);
    vi.mocked(getClientWorkspace).mockResolvedValue(null as never);

    const res = await POST(
      new Request("http://localhost/", {
        method: "POST",
        body: JSON.stringify({ goal: "Request a quote" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when forms cap is not enabled", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);
    vi.mocked(getClientWorkspace).mockResolvedValue(makeWorkspace("client-1", false) as never);

    const res = await POST(
      new Request("http://localhost/", {
        method: "POST",
        body: JSON.stringify({ goal: "Request a quote" }),
      }),
    );
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: "feature_not_in_plan" });
  });

  it("returns 400 when goal is invalid", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);
    vi.mocked(getClientWorkspace).mockResolvedValue(makeWorkspace() as never);

    const res = await POST(
      new Request("http://localhost/", {
        method: "POST",
        body: JSON.stringify({ goal: "Invalid goal value" }),
      }),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "validation_error" });
  });

  it("returns 404 when no website exists for the client", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);
    vi.mocked(getClientWorkspace).mockResolvedValue(makeWorkspace() as never);
    prismaMock.website.findFirst.mockResolvedValue(null);

    const res = await POST(
      new Request("http://localhost/", {
        method: "POST",
        body: JSON.stringify({ goal: "Request a quote" }),
      }),
    );
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: "no_website" });
  });

  it("returns 200 with ok and goal on success, scoped by workspace clientId", async () => {
    vi.mocked(requireCapability).mockResolvedValue(makeCtx() as never);
    vi.mocked(getClientWorkspace).mockResolvedValue(makeWorkspace("t-99") as never);
    prismaMock.website.findFirst.mockResolvedValue({ id: "web-1" } as never);
    prismaMock.website.update.mockResolvedValue({} as never);

    const res = await POST(
      new Request("http://localhost/", {
        method: "POST",
        body: JSON.stringify({ goal: "Request a quote" }),
      }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, goal: "Request a quote" });
    expect(prismaMock.website.findFirst).toHaveBeenCalledWith({
      where: { clientId: "t-99" },
      select: { id: true },
    });
    expect(prismaMock.website.update).toHaveBeenCalledWith({
      where: { id: "web-1" },
      data: { leadFormGoal: "Request a quote" },
    });
  });
});
