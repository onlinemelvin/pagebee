import { describe, it, expect } from "vitest";
import { kbKindFor, extractDocumentText } from "./extract";

function enc(s: string): ArrayBuffer {
  return new TextEncoder().encode(s).buffer;
}

describe("kbKindFor", () => {
  it("classifies by content type", () => {
    expect(kbKindFor("application/pdf", "policy.pdf")).toBe("pdf");
    expect(kbKindFor("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "x.docx")).toBe("docx");
    expect(kbKindFor("image/png", "logo.png")).toBe("image");
    expect(kbKindFor("text/plain", "notes.txt")).toBe("text");
  });
  it("falls back to extension when content type is generic", () => {
    expect(kbKindFor("application/octet-stream", "manual.pdf")).toBe("pdf");
    expect(kbKindFor("application/octet-stream", "faqs.md")).toBe("text");
  });
  it("rejects unsupported types", () => {
    expect(kbKindFor("application/zip", "archive.zip")).toBeNull();
  });
});

describe("extractDocumentText (text)", () => {
  it("decodes UTF-8 text", async () => {
    expect(await extractDocumentText(enc("Hours: 9-5 Mon-Fri"), "text")).toBe("Hours: 9-5 Mon-Fri");
  });
  it("collapses excess blank lines and trims", async () => {
    expect(await extractDocumentText(enc("  a\n\n\n\nb  "), "text")).toBe("a\n\nb");
  });
});
