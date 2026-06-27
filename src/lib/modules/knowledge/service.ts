import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { uploadPublicFile } from "@/lib/supabase/storage";
import { kbKindFor, extractDocumentText, captionImage } from "./extract";
import { knowledgeDataSchema, type KnowledgeData, type KnowledgeUpdate } from "./schema";

const MAX_CONTEXT_CHARS = 12_000; // ceiling on the assembled AI context (keeps prompts bounded)

/** Coerce the free-form AiKnowledgeBase.data blob into the typed structured fields (with defaults). */
function coerce(raw: unknown): KnowledgeData {
  const parsed = raw ? knowledgeDataSchema.safeParse(raw) : null;
  return parsed?.success ? parsed.data : knowledgeDataSchema.parse({});
}

export interface KnowledgeDocDTO {
  id: string;
  name: string;
  url: string;
  kind: string;
  charCount: number;
  hasText: boolean;
  preview: string; // first chars of the extracted text / caption (so the owner sees what the AI reads)
  createdAt: string;
}
function toDocDTO(d: { id: string; name: string; url: string; kind: string; text: string; charCount: number; createdAt: Date }): KnowledgeDocDTO {
  return {
    id: d.id, name: d.name, url: d.url, kind: d.kind, charCount: d.charCount,
    hasText: d.text.trim().length > 0,
    preview: d.text.slice(0, 280),
    createdAt: d.createdAt.toISOString(),
  };
}

/** Read the full knowledge base for the owner editor: curated fields + uploaded documents. */
export async function getKnowledge(clientId: string): Promise<{ data: KnowledgeData; documents: KnowledgeDocDTO[] }> {
  const [kb, docs] = await Promise.all([
    prisma.aiKnowledgeBase.findUnique({ where: { clientId }, select: { data: true } }),
    prisma.knowledgeDocument.findMany({ where: { clientId }, orderBy: { createdAt: "desc" } }),
  ]);
  return { data: coerce(kb?.data), documents: docs.map(toDocDTO) };
}

/** Merge-update the curated structured fields. */
export async function setKnowledge(clientId: string, patch: KnowledgeUpdate): Promise<KnowledgeData> {
  const existing = await prisma.aiKnowledgeBase.findUnique({ where: { clientId }, select: { data: true } });
  const merged = knowledgeDataSchema.parse({ ...coerce(existing?.data), ...patch });
  const data = merged as unknown as Prisma.InputJsonValue;
  await prisma.aiKnowledgeBase.upsert({ where: { clientId }, update: { data }, create: { clientId, data } });
  return merged;
}

/** Seed curated fields from website intake — only fills EMPTY fields so it never clobbers owner edits
 *  (safe to call on every (re)generation). */
export async function seedKnowledgeFromIntake(clientId: string, intake: { about?: string; details?: string; faqs?: { q: string; a: string }[] }): Promise<void> {
  const existing = coerce((await prisma.aiKnowledgeBase.findUnique({ where: { clientId }, select: { data: true } }))?.data);
  const patch: KnowledgeUpdate = {};
  if (!existing.about && intake.about?.trim()) patch.about = intake.about;
  if (!existing.details && intake.details?.trim()) patch.details = intake.details;
  if (!existing.faqs.length && intake.faqs?.length) patch.faqs = intake.faqs;
  if (Object.keys(patch).length) await setKnowledge(clientId, patch);
}

/** Upload + parse/caption a knowledge source. Returns the document DTO or an `{ error }`. */
export async function addDocument(clientId: string, file: { name: string; bytes: ArrayBuffer; contentType: string }): Promise<KnowledgeDocDTO | { error: string }> {
  const kind = kbKindFor(file.contentType, file.name);
  if (!kind) return { error: "unsupported_type" };

  const ext = (file.name.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "") || (kind === "image" ? "img" : "bin");
  const url = await uploadPublicFile(`${clientId}/kb/${randomBytes(8).toString("hex")}.${ext}`, file.bytes, file.contentType);
  if (!url) return { error: "upload_failed" };

  const text = kind === "image" ? await captionImage(file.bytes, file.contentType) : await extractDocumentText(file.bytes, kind);
  const doc = await prisma.knowledgeDocument.create({
    data: { clientId, name: file.name.slice(0, 200), url, kind, text, charCount: text.length },
  });
  return toDocDTO(doc);
}

/** Remove a knowledge document (tenant-scoped). */
export async function deleteDocument(clientId: string, id: string): Promise<void> {
  await prisma.knowledgeDocument.deleteMany({ where: { id, clientId } });
}

/**
 * Assemble the single AI context document the model reads — the curated fields followed by every
 * uploaded document's text / image caption, capped so it never blows the prompt. Shared by website
 * generation and the chat AI (loadBusinessFacts). Returns "" when there's nothing yet.
 */
export async function buildKbContext(clientId: string): Promise<string> {
  const [kb, docs] = await Promise.all([
    prisma.aiKnowledgeBase.findUnique({ where: { clientId }, select: { data: true } }),
    prisma.knowledgeDocument.findMany({ where: { clientId }, orderBy: { createdAt: "asc" }, select: { name: true, kind: true, text: true } }),
  ]);
  const d = coerce(kb?.data);
  const parts: string[] = [];
  if (d.about) parts.push(`About the business:\n${d.about}`);
  if (d.details) parts.push(`Business details:\n${d.details}`);
  if (d.policies) parts.push(`Policies:\n${d.policies}`);
  if (d.faqs.length) parts.push(`FAQs:\n${d.faqs.map((f) => `Q: ${f.q}\nA: ${f.a}`).join("\n\n")}`);
  for (const doc of docs) {
    if (!doc.text.trim()) continue;
    parts.push(`${doc.kind === "image" ? "Image" : "Document"} "${doc.name}":\n${doc.text}`);
  }
  const out = parts.join("\n\n---\n\n");
  return out.length > MAX_CONTEXT_CHARS ? out.slice(0, MAX_CONTEXT_CHARS) + "\n[truncated]" : out;
}
