import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/modules/website", () => ({
  finalizeGeneration: vi.fn(),
}));

import { POST } from "./route";
import { finalizeGeneration } from "@/lib/modules/website";

const SECRET = "internal-api-secret-xyz";

function makeReq(opts: { secret?: string | null; body?: unknown } = {}) {
  const secret = opts.secret === undefined ? SECRET : opts.secret;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret !== null) headers["x-internal-secret"] = secret;
  return new Request("http://localhost/api/v1/internal/generate/finalize", {
    method: "POST",
    headers,
    body: JSON.stringify(opts.body !== undefined ? opts.body : { jobId: "job_abc" }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.INTERNAL_API_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.INTERNAL_API_SECRET;
});

describe("POST /api/v1/internal/generate/finalize", () => {
  it("returns 503 when INTERNAL_API_SECRET is not configured", async () => {
    delete process.env.INTERNAL_API_SECRET;
    const res = await POST(makeReq() as never);
    expect(res.status).toBe(503);
    expect(finalizeGeneration).not.toHaveBeenCalled();
  });

  it("returns 401 when x-internal-secret header is missing", async () => {
    const res = await POST(makeReq({ secret: null }) as never);
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ error: "unauthorized" });
    expect(finalizeGeneration).not.toHaveBeenCalled();
  });

  it("returns 401 when x-internal-secret header is wrong", async () => {
    const res = await POST(makeReq({ secret: "wrong-secret" }) as never);
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ error: "unauthorized" });
    expect(finalizeGeneration).not.toHaveBeenCalled();
  });

  it("returns 400 when body fails validation (missing jobId)", async () => {
    const res = await POST(makeReq({ body: {} }) as never);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "validation_error" });
    expect(finalizeGeneration).not.toHaveBeenCalled();
  });

  it("returns 400 when body is not valid JSON", async () => {
    const req = new Request("http://localhost/api/v1/internal/generate/finalize", {
      method: "POST",
      headers: { "x-internal-secret": SECRET, "content-type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "validation_error" });
  });

  it("returns 400 when jobId is empty string", async () => {
    const res = await POST(makeReq({ body: { jobId: "" } }) as never);
    expect(res.status).toBe(400);
  });

  it("calls finalizeGeneration with jobId and returns 200 on success", async () => {
    vi.mocked(finalizeGeneration).mockResolvedValue(undefined as never);
    const res = await POST(makeReq({ body: { jobId: "job_abc" } }) as never);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true });
    expect(finalizeGeneration).toHaveBeenCalledWith("job_abc");
  });

  it("returns 500 when finalizeGeneration throws", async () => {
    vi.mocked(finalizeGeneration).mockRejectedValue(new Error("assembly failed"));
    const res = await POST(makeReq() as never);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: "finalize_failed" });
  });
});
