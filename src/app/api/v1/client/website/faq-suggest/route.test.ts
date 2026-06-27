import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireCapability: vi.fn(),
  AuthError,
}));
// Mock the Anthropic SDK so no real HTTP calls happen
vi.mock("@anthropic-ai/sdk", () => {
  const create = vi.fn();
  return { default: vi.fn(() => ({ messages: { create } })) };
});

import { POST } from "./route";
import { requireCapability } from "@/lib/auth/session";
import Anthropic from "@anthropic-ai/sdk";

const req = (body: unknown) =>
  new Request("http://localhost/api/v1/client/website/faq-suggest", {
    method: "POST",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ANTHROPIC_API_KEY;
});

describe("POST /api/v1/client/website/faq-suggest", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));
    const res = await POST(req({}));
    expect(res.status).toBe(401);
  });

  it("returns 403 when capability denied", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(403));
    const res = await POST(req({}));
    expect(res.status).toBe(403);
  });

  it("returns 503 when ANTHROPIC_API_KEY is not set", async () => {
    vi.mocked(requireCapability).mockResolvedValue({} as never);
    const res = await POST(req({}));
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({ error: "ai_unavailable" });
  });

  it("returns 400 for invalid body (about too long)", async () => {
    vi.mocked(requireCapability).mockResolvedValue({} as never);
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const res = await POST(req({ about: "x".repeat(2001) }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "validation_error" });
  });

  it("returns FAQs on success", async () => {
    vi.mocked(requireCapability).mockResolvedValue({} as never);
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";

    const faqs = [{ q: "What do you do?", a: "We fix plumbing." }];
    const faqText = JSON.stringify(faqs);
    const AnthropicMock = vi.mocked(Anthropic);
    const createMock = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: faqText }],
    });
    AnthropicMock.mockImplementation(() => ({ messages: { create: createMock } }) as never);

    const res = await POST(req({ businessType: "Plumbing", about: "Family plumbing co." }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ faqs });
  });

  it("returns 500 when AI response has no JSON", async () => {
    vi.mocked(requireCapability).mockResolvedValue({} as never);
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";

    const AnthropicMock = vi.mocked(Anthropic);
    const createMock = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "Sorry, I can't help with that." }],
    });
    AnthropicMock.mockImplementation(() => ({ messages: { create: createMock } }) as never);

    const res = await POST(req({}));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: "generation_failed" });
  });
});
