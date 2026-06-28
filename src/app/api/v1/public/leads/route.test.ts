import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/site-token", () => ({
  getSiteToken: vi.fn(() => "tok"),
  resolveSite: vi.fn(),
}));
// Rate limiting is exercised in ratelimit.test.ts; here it's a pass-through so guards are deterministic.
vi.mock("@/lib/ratelimit", () => ({
  rateLimited: vi.fn(async () => null),
  rateLimitedKey: vi.fn(async () => null),
}));
const { leadInputSchema } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- hoisted factory runs before ES imports initialize
  const { z } = require("zod");
  return {
    leadInputSchema: z.object({
      type: z.string().optional(),
      name: z.string().min(1),
      email: z.string().email(),
      phone: z.string().optional(),
      message: z.string().optional(),
      source: z.string().optional(),
    }),
  };
});
vi.mock("@/lib/modules/lead", () => ({
  createLead: vi.fn(),
  leadCaptureEnabled: vi.fn(),
  leadInputSchema,
  // Real logic (pure): honeypot filled or implausibly fast submit.
  looksLikeBotSubmission: (body: unknown) => {
    if (!body || typeof body !== "object") return false;
    const b = body as Record<string, unknown>;
    if (typeof b.company === "string" && b.company.trim().length > 0) return true;
    const t = Number(b._t);
    return Number.isFinite(t) && t > 0 && t < 1500;
  },
}));
vi.mock("@/lib/events/subscribers", () => ({}));
const posthogCapture = vi.hoisted(() => vi.fn());
vi.mock("@/lib/posthog-server", () => ({
  getPostHogClient: () => ({ capture: posthogCapture }),
}));

import { POST } from "./route";
import { resolveSite } from "@/lib/auth/site-token";
import { createLead, leadCaptureEnabled } from "@/lib/modules/lead";

const valid = { name: "Sam", email: "a@b.com" };
const req = (body: unknown) =>
  new Request("http://localhost/api/v1/public/leads", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer tok" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  // resetAllMocks (global setup) wipes factory implementations — re-apply.
});

describe("POST /api/v1/public/leads", () => {
  it("401 when the site token does not resolve", async () => {
    vi.mocked(resolveSite).mockResolvedValue(null);
    const res = await POST(req(valid));
    expect(res.status).toBe(401);
    expect(createLead).not.toHaveBeenCalled();
  });

  it("400 on validation failure (bad email)", async () => {
    vi.mocked(resolveSite).mockResolvedValue({ websiteId: "w", clientId: "c1", status: "live" });
    const res = await POST(req({ name: "Sam", email: "nope" }));
    expect(res.status).toBe(400);
  });

  it("preview status returns a demo, no lead created", async () => {
    vi.mocked(resolveSite).mockResolvedValue({ websiteId: "w", clientId: "c1", status: "preview" });
    const res = await POST(req(valid));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ demo: true });
    expect(createLead).not.toHaveBeenCalled();
  });

  it("403 when lead capture is disabled", async () => {
    vi.mocked(resolveSite).mockResolvedValue({ websiteId: "w", clientId: "c1", status: "live" });
    vi.mocked(leadCaptureEnabled).mockResolvedValue(false);
    const res = await POST(req(valid));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "forms_disabled" });
  });

  it("happy path: creates the lead scoped to the token's clientId", async () => {
    vi.mocked(resolveSite).mockResolvedValue({ websiteId: "w", clientId: "c1", status: "live" });
    vi.mocked(leadCaptureEnabled).mockResolvedValue(true);
    vi.mocked(createLead).mockResolvedValue({
      id: "l1",
      status: "NEW",
      createdAt: "2026-01-01",
    } as never);
    const res = await POST(req(valid));
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({ id: "l1", status: "NEW" });
    expect(createLead).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "c1", input: valid }),
    );
  });

  it("silently drops a submission whose honeypot is filled (looks like success, no lead)", async () => {
    vi.mocked(resolveSite).mockResolvedValue({ websiteId: "w", clientId: "c1", status: "live" });
    vi.mocked(leadCaptureEnabled).mockResolvedValue(true);
    const res = await POST(req({ ...valid, company: "Acme Bots Inc" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ status: "RECEIVED" });
    expect(createLead).not.toHaveBeenCalled();
  });

  it("silently drops an implausibly fast submit (_t under the human threshold)", async () => {
    vi.mocked(resolveSite).mockResolvedValue({ websiteId: "w", clientId: "c1", status: "live" });
    vi.mocked(leadCaptureEnabled).mockResolvedValue(true);
    const res = await POST(req({ ...valid, _t: 200 }));
    expect(res.status).toBe(200);
    expect(createLead).not.toHaveBeenCalled();
  });

  it("accepts a normal-paced submit (_t above the threshold)", async () => {
    vi.mocked(resolveSite).mockResolvedValue({ websiteId: "w", clientId: "c1", status: "live" });
    vi.mocked(leadCaptureEnabled).mockResolvedValue(true);
    vi.mocked(createLead).mockResolvedValue({ id: "l2", status: "NEW", createdAt: "2026-01-01" } as never);
    const res = await POST(req({ ...valid, _t: 8000, company: "" }));
    expect(res.status).toBe(201);
    expect(createLead).toHaveBeenCalled();
  });
});
