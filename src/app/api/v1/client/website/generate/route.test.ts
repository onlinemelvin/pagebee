import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireOwner: vi.fn(),
  requireCapability: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/website", () => ({
  startGeneration: vi.fn(),
  claimAndRun: vi.fn(),
  prepareGeneration: vi.fn(),
  gateRegenQuota: vi.fn(),
  getLatestJobStatus: vi.fn(),
  websiteIntakeSchema: {
    safeParse: vi.fn(),
  },
}));
vi.mock("@/lib/modules/client", () => ({
  isTestMode: vi.fn(),
}));
// next/server `after` is a no-op in tests
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: vi.fn((fn: () => void) => fn()) };
});

import { POST, GET } from "./route";
import { requireOwner, requireCapability } from "@/lib/auth/session";
import {
  startGeneration,
  claimAndRun,
  prepareGeneration,
  gateRegenQuota,
  getLatestJobStatus,
  websiteIntakeSchema,
} from "@/lib/modules/website";
import { isTestMode } from "@/lib/modules/client";

const makeClient = (id = "c1") => ({ id });

const req = (body: unknown) =>
  new Request("http://localhost/api/v1/client/website/generate", {
    method: "POST",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.VERCEL;
  delete process.env.GENERATION_WORKER;
});

describe("POST /api/v1/client/website/generate", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(401));
    const res = await POST(req({}));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-owner", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(403));
    const res = await POST(req({}));
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid intake schema", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(websiteIntakeSchema.safeParse).mockReturnValue({
      success: false,
      error: { flatten: () => ({ fieldErrors: {}, formErrors: [] }) },
    } as never);
    const res = await POST(req({ invalid: true }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "validation_error" });
  });

  it("returns 409 when regen quota exceeded", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(websiteIntakeSchema.safeParse).mockReturnValue({ success: true, data: {} } as never);
    vi.mocked(gateRegenQuota).mockResolvedValue({ ok: false, reason: "out_of_updates" } as never);
    const res = await POST(req({}));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ ok: false, reason: "out_of_updates" });
  });

  it("returns 202 and runs inline in non-Vercel test mode", async () => {
    vi.mocked(requireOwner).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(websiteIntakeSchema.safeParse).mockReturnValue({ success: true, data: {} } as never);
    vi.mocked(gateRegenQuota).mockResolvedValue({ ok: true } as never);
    vi.mocked(startGeneration).mockResolvedValue({ jobId: "j1" } as never);
    vi.mocked(isTestMode).mockResolvedValue(true);
    vi.mocked(claimAndRun).mockResolvedValue(undefined as never);
    const res = await POST(req({}));
    expect(res.status).toBe(202);
    await expect(res.json()).resolves.toMatchObject({ jobId: "j1", status: "queued" });
    expect(claimAndRun).toHaveBeenCalledWith("j1");
  });

  it("returns 202 and does not run inline when external worker is set", async () => {
    process.env.GENERATION_WORKER = "external";
    vi.mocked(requireOwner).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(websiteIntakeSchema.safeParse).mockReturnValue({ success: true, data: {} } as never);
    vi.mocked(gateRegenQuota).mockResolvedValue({ ok: true } as never);
    vi.mocked(startGeneration).mockResolvedValue({ jobId: "j2" } as never);
    vi.mocked(isTestMode).mockResolvedValue(false);
    const res = await POST(req({}));
    expect(res.status).toBe(202);
    expect(claimAndRun).not.toHaveBeenCalled();
    expect(prepareGeneration).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/client/website/generate", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await GET();
    expect(res.status).toBe(401);
    expect(getLatestJobStatus).not.toHaveBeenCalled();
  });

  it("returns 403 when capability denied", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(403));
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns the latest job status", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: makeClient() } as never);
    const job = { id: "j1", status: "COMPLETED" };
    vi.mocked(getLatestJobStatus).mockResolvedValue(job as never);
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ job });
    expect(getLatestJobStatus).toHaveBeenCalledWith("c1");
  });

  it("returns null job when no generation exists", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: makeClient() } as never);
    vi.mocked(getLatestJobStatus).mockResolvedValue(null as never);
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ job: null });
  });
});
