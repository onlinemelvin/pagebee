import { describe, it, expect } from "vitest";
import { normalizeDedupeKey } from "./dedupe";

describe("normalizeDedupeKey", () => {
  it("collapses case, whitespace, and punctuation in the business name", () => {
    const a = normalizeDedupeKey({ businessName: "Joe's  Pizza, Inc." });
    const b = normalizeDedupeKey({ businessName: "joes pizza inc" });
    expect(a).toBe(b);
  });

  it("strips non-digits from the phone so formatting differences collide", () => {
    const a = normalizeDedupeKey({ businessName: "Acme", phone: "(415) 555-1234" });
    const b = normalizeDedupeKey({ businessName: "Acme", phone: "4155551234" });
    expect(a).toBe(b);
  });

  it("lowercases the email and tolerates missing fields", () => {
    expect(normalizeDedupeKey({ businessName: "Acme", email: "Hi@Acme.COM" })).toBe("acme||hi@acme.com");
    expect(normalizeDedupeKey({ businessName: "Acme" })).toBe("acme||");
  });

  it("distinguishes genuinely different businesses", () => {
    expect(normalizeDedupeKey({ businessName: "Acme" })).not.toBe(normalizeDedupeKey({ businessName: "Beta" }));
  });
});
