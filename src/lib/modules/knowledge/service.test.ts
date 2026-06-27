import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

// Mock external dependencies before importing the service.
vi.mock("@/lib/supabase/storage", () => ({
  uploadPublicFile: vi.fn(),
}));
vi.mock("@/lib/modules/knowledge/extract", () => ({
  kbKindFor: vi.fn(),
  extractDocumentText: vi.fn(),
  captionImage: vi.fn(),
}));

import { getKnowledge, setKnowledge, seedKnowledgeFromIntake, addDocument, deleteDocument, buildKbContext } from "./service";
import { uploadPublicFile } from "@/lib/supabase/storage";
import { kbKindFor, extractDocumentText, captionImage } from "./extract";

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── getKnowledge ─────────────────────────────────────────────────────────────

describe("getKnowledge", () => {
  it("queries by the provided clientId (tenant scoping)", async () => {
    prismaMock.aiKnowledgeBase.findUnique.mockResolvedValue(null);
    prismaMock.knowledgeDocument.findMany.mockResolvedValue([]);

    await getKnowledge("c1");

    expect(prismaMock.aiKnowledgeBase.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientId: "c1" } }),
    );
    expect(prismaMock.knowledgeDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientId: "c1" } }),
    );
  });

  it("returns defaults when no kb row exists", async () => {
    prismaMock.aiKnowledgeBase.findUnique.mockResolvedValue(null);
    prismaMock.knowledgeDocument.findMany.mockResolvedValue([]);

    const result = await getKnowledge("c1");

    expect(result.data).toEqual({ about: "", details: "", policies: "", faqs: [] });
    expect(result.documents).toEqual([]);
  });

  it("coerces the stored data blob into typed fields", async () => {
    prismaMock.aiKnowledgeBase.findUnique.mockResolvedValue({
      data: { about: "We fix plumbing", details: "24/7", policies: "", faqs: [] },
    } as never);
    prismaMock.knowledgeDocument.findMany.mockResolvedValue([]);

    const result = await getKnowledge("c1");
    expect(result.data.about).toBe("We fix plumbing");
  });

  it("maps documents into DTOs with a preview and hasText flag", async () => {
    prismaMock.aiKnowledgeBase.findUnique.mockResolvedValue(null);
    prismaMock.knowledgeDocument.findMany.mockResolvedValue([
      { id: "d1", name: "menu.pdf", url: "https://x.com/d1", kind: "pdf", text: "Page content here", charCount: 17, createdAt: new Date("2024-01-01") },
    ] as never);

    const result = await getKnowledge("c1");
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0]).toMatchObject({
      id: "d1",
      name: "menu.pdf",
      kind: "pdf",
      hasText: true,
      preview: "Page content here",
    });
  });

  it("marks hasText false for a blank-text document", async () => {
    prismaMock.aiKnowledgeBase.findUnique.mockResolvedValue(null);
    prismaMock.knowledgeDocument.findMany.mockResolvedValue([
      { id: "d2", name: "photo.jpg", url: "https://x.com/d2", kind: "image", text: "   ", charCount: 0, createdAt: new Date() },
    ] as never);

    const result = await getKnowledge("c1");
    expect(result.documents[0].hasText).toBe(false);
  });
});

// ─── setKnowledge ─────────────────────────────────────────────────────────────

describe("setKnowledge", () => {
  it("merges the patch over the existing data and upserts", async () => {
    prismaMock.aiKnowledgeBase.findUnique.mockResolvedValue({
      data: { about: "Old about", details: "", policies: "", faqs: [] },
    } as never);
    prismaMock.aiKnowledgeBase.upsert.mockResolvedValue({} as never);

    const result = await setKnowledge("c1", { about: "New about" });

    expect(result.about).toBe("New about");
    expect(prismaMock.aiKnowledgeBase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientId: "c1" } }),
    );
  });

  it("creates the row when none exists (upsert create path)", async () => {
    prismaMock.aiKnowledgeBase.findUnique.mockResolvedValue(null);
    prismaMock.aiKnowledgeBase.upsert.mockResolvedValue({} as never);

    await setKnowledge("c1", { about: "Hello" });

    expect(prismaMock.aiKnowledgeBase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ clientId: "c1" }),
      }),
    );
  });

  it("scopes the upsert by clientId to prevent cross-tenant writes", async () => {
    prismaMock.aiKnowledgeBase.findUnique.mockResolvedValue(null);
    prismaMock.aiKnowledgeBase.upsert.mockResolvedValue({} as never);

    await setKnowledge("tenant-A", { details: "details" });

    const call = prismaMock.aiKnowledgeBase.upsert.mock.calls[0][0];
    expect(call.where.clientId).toBe("tenant-A");
    expect(call.create.clientId).toBe("tenant-A");
  });
});

// ─── seedKnowledgeFromIntake ──────────────────────────────────────────────────

describe("seedKnowledgeFromIntake", () => {
  it("skips fields that are already populated (never clobbers owner edits)", async () => {
    prismaMock.aiKnowledgeBase.findUnique.mockResolvedValue({
      data: { about: "Already set", details: "", policies: "", faqs: [] },
    } as never);
    prismaMock.aiKnowledgeBase.upsert.mockResolvedValue({} as never);

    await seedKnowledgeFromIntake("c1", { about: "New value from intake", details: "Detail" });

    const upsertCall = prismaMock.aiKnowledgeBase.upsert.mock.calls[0]?.[0];
    // Only `details` should be patched; `about` is already set.
    if (upsertCall) {
      const data = upsertCall.update.data as Record<string, unknown>;
      expect((data as { about?: string }).about).not.toBe("New value from intake");
    }
  });

  it("does not call setKnowledge (upsert) when nothing needs seeding", async () => {
    prismaMock.aiKnowledgeBase.findUnique.mockResolvedValue({
      data: { about: "set", details: "set", policies: "", faqs: [{ q: "Q", a: "A" }] },
    } as never);

    await seedKnowledgeFromIntake("c1", { about: "ignored", details: "ignored", faqs: [{ q: "x", a: "y" }] });

    expect(prismaMock.aiKnowledgeBase.upsert).not.toHaveBeenCalled();
  });

  it("fills all empty fields when the kb row does not exist", async () => {
    prismaMock.aiKnowledgeBase.findUnique.mockResolvedValue(null);
    prismaMock.aiKnowledgeBase.upsert.mockResolvedValue({} as never);

    await seedKnowledgeFromIntake("c1", { about: "About", details: "Details", faqs: [{ q: "Q", a: "A" }] });

    expect(prismaMock.aiKnowledgeBase.upsert).toHaveBeenCalledTimes(1);
  });
});

// ─── addDocument ──────────────────────────────────────────────────────────────

describe("addDocument", () => {
  const file = { name: "menu.pdf", bytes: new ArrayBuffer(8), contentType: "application/pdf" };

  it("returns { error: 'unsupported_type' } for an unrecognised content type", async () => {
    vi.mocked(kbKindFor).mockReturnValue(null);

    const result = await addDocument("c1", { ...file, contentType: "application/x-unknown" });

    expect(result).toEqual({ error: "unsupported_type" });
    expect(uploadPublicFile).not.toHaveBeenCalled();
  });

  it("returns { error: 'upload_failed' } when Supabase storage returns null", async () => {
    vi.mocked(kbKindFor).mockReturnValue("pdf");
    vi.mocked(uploadPublicFile).mockResolvedValue(null);

    const result = await addDocument("c1", file);

    expect(result).toEqual({ error: "upload_failed" });
    expect(prismaMock.knowledgeDocument.create).not.toHaveBeenCalled();
  });

  it("persists the document with clientId and returns a DTO on success (PDF)", async () => {
    vi.mocked(kbKindFor).mockReturnValue("pdf");
    vi.mocked(uploadPublicFile).mockResolvedValue("https://cdn.example.com/menu.pdf");
    vi.mocked(extractDocumentText).mockResolvedValue("Page 1 content");
    prismaMock.knowledgeDocument.create.mockResolvedValue({
      id: "doc1",
      clientId: "c1",
      name: "menu.pdf",
      url: "https://cdn.example.com/menu.pdf",
      kind: "pdf",
      text: "Page 1 content",
      charCount: 14,
      createdAt: new Date("2024-01-01"),
    } as never);

    const result = await addDocument("c1", file);

    expect(prismaMock.knowledgeDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ clientId: "c1", kind: "pdf" }) }),
    );
    expect(result).toMatchObject({ id: "doc1", kind: "pdf", hasText: true });
  });

  it("calls captionImage (not extractDocumentText) for image uploads", async () => {
    vi.mocked(kbKindFor).mockReturnValue("image");
    vi.mocked(uploadPublicFile).mockResolvedValue("https://cdn.example.com/photo.jpg");
    vi.mocked(captionImage).mockResolvedValue("A team photo");
    prismaMock.knowledgeDocument.create.mockResolvedValue({
      id: "doc2",
      clientId: "c1",
      name: "photo.jpg",
      url: "https://cdn.example.com/photo.jpg",
      kind: "image",
      text: "A team photo",
      charCount: 12,
      createdAt: new Date(),
    } as never);

    const imageFile = { name: "photo.jpg", bytes: new ArrayBuffer(4), contentType: "image/jpeg" };
    await addDocument("c1", imageFile);

    expect(captionImage).toHaveBeenCalled();
    expect(extractDocumentText).not.toHaveBeenCalled();
  });
});

// ─── deleteDocument ───────────────────────────────────────────────────────────

describe("deleteDocument", () => {
  it("deletes scoped by both id AND clientId (IDOR guard)", async () => {
    prismaMock.knowledgeDocument.deleteMany.mockResolvedValue({ count: 1 });

    await deleteDocument("c1", "doc-x");

    expect(prismaMock.knowledgeDocument.deleteMany).toHaveBeenCalledWith({
      where: { id: "doc-x", clientId: "c1" },
    });
  });

  it("is a no-op (not an error) when the document belongs to another tenant", async () => {
    prismaMock.knowledgeDocument.deleteMany.mockResolvedValue({ count: 0 });

    await expect(deleteDocument("c1", "belongs-to-c2")).resolves.toBeUndefined();
  });
});

// ─── buildKbContext ───────────────────────────────────────────────────────────

describe("buildKbContext", () => {
  it("returns empty string when there is no data and no documents", async () => {
    prismaMock.aiKnowledgeBase.findUnique.mockResolvedValue(null);
    prismaMock.knowledgeDocument.findMany.mockResolvedValue([]);

    const ctx = await buildKbContext("c1");

    expect(ctx).toBe("");
  });

  it("assembles curated fields into the context string", async () => {
    prismaMock.aiKnowledgeBase.findUnique.mockResolvedValue({
      data: { about: "We are PageBee", details: "24/7 support", policies: "No refunds", faqs: [{ q: "Hours?", a: "9-5" }] },
    } as never);
    prismaMock.knowledgeDocument.findMany.mockResolvedValue([]);

    const ctx = await buildKbContext("c1");

    expect(ctx).toContain("We are PageBee");
    expect(ctx).toContain("24/7 support");
    expect(ctx).toContain("No refunds");
    expect(ctx).toContain("Q: Hours?");
    expect(ctx).toContain("A: 9-5");
  });

  it("includes uploaded document text in the context", async () => {
    prismaMock.aiKnowledgeBase.findUnique.mockResolvedValue(null);
    prismaMock.knowledgeDocument.findMany.mockResolvedValue([
      { name: "menu.pdf", kind: "pdf", text: "Burger $10" },
      { name: "logo.png", kind: "image", text: "A red logo on white background" },
    ] as never);

    const ctx = await buildKbContext("c1");

    expect(ctx).toContain('Document "menu.pdf"');
    expect(ctx).toContain("Burger $10");
    expect(ctx).toContain('Image "logo.png"');
    expect(ctx).toContain("A red logo on white background");
  });

  it("skips documents with blank text", async () => {
    prismaMock.aiKnowledgeBase.findUnique.mockResolvedValue(null);
    prismaMock.knowledgeDocument.findMany.mockResolvedValue([
      { name: "empty.pdf", kind: "pdf", text: "   " },
    ] as never);

    const ctx = await buildKbContext("c1");
    expect(ctx).toBe("");
  });

  it("truncates output that exceeds MAX_CONTEXT_CHARS (12000)", async () => {
    // Use a document with very long text to reliably trigger the truncation path.
    // Providing longText via a document avoids any coerce/default edge cases.
    const longText = "y".repeat(15_000);
    prismaMock.aiKnowledgeBase.findUnique.mockResolvedValue(null);
    prismaMock.knowledgeDocument.findMany.mockResolvedValue([
      { name: "big.txt", kind: "text", text: longText },
    ] as never);

    const ctx = await buildKbContext("c1");

    expect(ctx).toContain("[truncated]");
    expect(ctx.length).toBeLessThan(13_000);
  });
});
