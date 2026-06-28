import { describe, it, expect } from "vitest";
import { looksLikeBotSubmission } from "./schema";

describe("looksLikeBotSubmission", () => {
  const human = { name: "Sam", email: "sam@x.com", phone: "555" };

  it("passes a normal submission with no signals", () => {
    expect(looksLikeBotSubmission(human)).toBe(false);
  });

  it("passes when the honeypot is present but empty", () => {
    expect(looksLikeBotSubmission({ ...human, company: "" })).toBe(false);
    expect(looksLikeBotSubmission({ ...human, company: "   " })).toBe(false);
  });

  it("flags a filled honeypot", () => {
    expect(looksLikeBotSubmission({ ...human, company: "Bots LLC" })).toBe(true);
  });

  it("flags an implausibly fast submit", () => {
    expect(looksLikeBotSubmission({ ...human, _t: 1 })).toBe(true);
    expect(looksLikeBotSubmission({ ...human, _t: 1499 })).toBe(true);
  });

  it("allows a human-paced submit", () => {
    expect(looksLikeBotSubmission({ ...human, _t: 1500 })).toBe(false);
    expect(looksLikeBotSubmission({ ...human, _t: 9000 })).toBe(false);
  });

  it("does not flag when timing is absent or unparseable (legacy/cached forms)", () => {
    expect(looksLikeBotSubmission({ ...human })).toBe(false);
    expect(looksLikeBotSubmission({ ...human, _t: "abc" })).toBe(false);
    expect(looksLikeBotSubmission({ ...human, _t: 0 })).toBe(false);
  });

  it("is safe on non-object input", () => {
    expect(looksLikeBotSubmission(null)).toBe(false);
    expect(looksLikeBotSubmission("x")).toBe(false);
    expect(looksLikeBotSubmission(undefined)).toBe(false);
  });
});
