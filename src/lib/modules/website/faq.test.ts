import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Anthropic SDK so no real HTTP calls happen.
vi.mock("@anthropic-ai/sdk", () => {
  const create = vi.fn();
  return { default: vi.fn(() => ({ messages: { create } })) };
});

import { suggestFaqs, FaqUnavailableError } from "./faq";
import Anthropic from "@anthropic-ai/sdk";

function wireModel(text: string) {
  vi.mocked(Anthropic).mockImplementation(
    () => ({ messages: { create: vi.fn().mockResolvedValue({ content: [{ type: "text", text }] }) } }) as never,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ANTHROPIC_API_KEY;
});

describe("suggestFaqs", () => {
  it("throws FaqUnavailableError when no API key is configured", async () => {
    await expect(suggestFaqs({ about: "x" })).rejects.toBeInstanceOf(FaqUnavailableError);
  });

  it("returns parsed FAQ pairs from the model response", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const faqs = [{ q: "What do you do?", a: "We fix plumbing." }];
    wireModel(JSON.stringify(faqs));
    await expect(suggestFaqs({ businessType: "Plumbing", about: "Family co." })).resolves.toEqual(faqs);
  });

  it("extracts the JSON array even with surrounding prose", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    wireModel('Sure! Here you go: [{"q":"Hours?","a":"9–5."}] Hope that helps.');
    await expect(suggestFaqs({ about: "Shop" })).resolves.toEqual([{ q: "Hours?", a: "9–5." }]);
  });

  it("throws when the model returns no JSON array", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    wireModel("Sorry, I can't help with that.");
    await expect(suggestFaqs({ about: "Shop" })).rejects.toThrow();
  });

  it("rejects invalid input (about too long) before calling the model", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    await expect(suggestFaqs({ about: "x".repeat(2001) })).rejects.toThrow();
  });
});
