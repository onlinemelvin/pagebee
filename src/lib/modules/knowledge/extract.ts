import Anthropic from "@anthropic-ai/sdk";

// Turn an uploaded knowledge-base source into the plain text the AI reads: parse documents
// (PDF via unpdf, DOCX via mammoth, plain text as-is) and caption images via Claude vision. Every
// path is fail-soft — a parse failure returns "" rather than blocking the upload.

export type KbKind = "pdf" | "docx" | "text" | "image";

const MAX_DOC_CHARS = 50_000; // per-document cap; buildKbContext caps the assembled total again
const IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"]);

/** Classify an upload by content type / filename into a KB kind, or null if unsupported. */
export function kbKindFor(contentType: string, name: string): KbKind | null {
  const ct = contentType.toLowerCase();
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ct === "application/pdf" || ext === "pdf") return "pdf";
  if (ct.includes("wordprocessingml") || ext === "docx") return "docx";
  if (IMAGE_TYPES.has(ct) || ["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return "image";
  if (ct.startsWith("text/") || ["txt", "md", "markdown", "csv"].includes(ext)) return "text";
  return null;
}

/** Collapse trailing spaces + excess blank lines, trim, and cap the length. */
function clamp(s: string): string {
  const t = s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return t.length > MAX_DOC_CHARS ? t.slice(0, MAX_DOC_CHARS) + "\n[truncated]" : t;
}

/** Extract readable text from a document (PDF/DOCX/text). Returns "" on any failure. */
export async function extractDocumentText(bytes: ArrayBuffer, kind: KbKind): Promise<string> {
  try {
    if (kind === "pdf") {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      const { text } = await extractText(pdf, { mergePages: true });
      return clamp(Array.isArray(text) ? text.join("\n") : text);
    }
    if (kind === "docx") {
      const mammoth = (await import("mammoth")).default;
      const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
      return clamp(value);
    }
    if (kind === "text") {
      return clamp(new TextDecoder("utf-8", { fatal: false }).decode(bytes));
    }
  } catch (err) {
    console.error(`[knowledge] extract ${kind} failed`, err);
  }
  return "";
}

/**
 * Caption a company image for the knowledge base via Claude vision — a concise, factual description
 * the text AI can use. Returns "" when no API key or on error (the image is still stored + usable on
 * the site; it just adds no AI context).
 */
export async function captionImage(bytes: ArrayBuffer, contentType: string): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) return "";
  const mediaType = contentType.toLowerCase() === "image/jpg" ? "image/jpeg" : contentType.toLowerCase();
  if (!IMAGE_TYPES.has(mediaType)) return "";
  try {
    const anthropic = new Anthropic();
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: Buffer.from(bytes).toString("base64") } },
            { type: "text", text: "Describe this image factually in 1-2 sentences for a local business's knowledge base - what it shows (product, work, team, space, signage, etc.). No marketing fluff, no guesses about anything not visible." },
          ],
        },
      ],
    });
    return clamp(msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim());
  } catch (err) {
    console.error("[knowledge] image caption failed", err);
    return "";
  }
}
