import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireContractedRep: vi.fn(),
  AuthError,
}));
vi.mock("@anthropic-ai/sdk", () => {
  const create = vi.fn();
  return { default: vi.fn(() => ({ messages: { create } })) };
});

import { POST } from "./route";
import { requireContractedRep } from "@/lib/auth/session";
import Anthropic from "@anthropic-ai/sdk";

const req = (body: unknown) =>
  new Request("http://localhost/api/v1/rep/website/faq-suggest", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ANTHROPIC_API_KEY;
});

describe("POST /api/v1/rep/website/faq-suggest", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireContractedRep).mockRejectedValue(new AuthError(401));
    expect((await POST(req({}))).status).toBe(401);
  });

  it("returns 403 when the rep has no active contract", async () => {
    vi.mocked(requireContractedRep).mockRejectedValue(new AuthError(403, "contract_required"));
    expect((await POST(req({}))).status).toBe(403);
  });

  it("returns 503 when ANTHROPIC_API_KEY is not set", async () => {
    vi.mocked(requireContractedRep).mockResolvedValue({} as never);
    const res = await POST(req({}));
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({ error: "ai_unavailable" });
  });

  it("returns 400 for invalid input", async () => {
    vi.mocked(requireContractedRep).mockResolvedValue({} as never);
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const res = await POST(req({ about: "x".repeat(2001) }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "validation_error" });
  });

  it("returns FAQs on success", async () => {
    vi.mocked(requireContractedRep).mockResolvedValue({} as never);
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const faqs = [{ q: "Do you deliver?", a: "Yes, citywide." }];
    vi.mocked(Anthropic).mockImplementation(
      () => ({ messages: { create: vi.fn().mockResolvedValue({ content: [{ type: "text", text: JSON.stringify(faqs) }] }) } }) as never,
    );
    const res = await POST(req({ about: "Pizzeria", services: ["Delivery"] }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ faqs });
  });
});
