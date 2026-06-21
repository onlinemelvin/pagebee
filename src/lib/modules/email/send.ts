import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const resend = apiKey ? new Resend(apiKey) : null;

const DEFAULT_FROM = process.env.RESEND_FROM_EMAIL ?? "PageBee <noreply@pagebee.com>";

export interface EmailAttachment {
  filename: string;
  content: Buffer; // raw bytes; forwarded to Resend as base64
}

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
  /** RFC 8058 one-click unsubscribe + List-Unsubscribe headers (marketing only). */
  listUnsubscribeUrl?: string;
  /** Optional Resend tags (category, campaign) surfaced in provider webhooks. */
  headers?: Record<string, string>;
}

/** Escape user-controlled values before interpolating them into email HTML bodies. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Centralized low-level email send (docs/ARCHITECTURE.md §8.8). Falls back to
 * console logging when RESEND_API_KEY is unset, so dev works without a Resend
 * account. Most callers should use `dispatch()` (dispatch.ts) instead — it adds
 * EmailLog persistence, suppression, and the branded layout. Use this directly
 * only for raw/system mail that must bypass that pipeline.
 */
export async function sendEmail(params: SendEmailParams): Promise<{ id: string | null; stubbed: boolean }> {
  const from = params.from ?? DEFAULT_FROM;

  const headers: Record<string, string> = { ...(params.headers ?? {}) };
  if (params.listUnsubscribeUrl) {
    headers["List-Unsubscribe"] = `<${params.listUnsubscribeUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  if (!resend) {
    const att = params.attachments?.length ? ` attachments=${params.attachments.map((a) => a.filename).join(",")}` : "";
    console.log(
      `[email:stub] to=${params.to} from="${from}"${params.replyTo ? ` replyTo=${params.replyTo}` : ""} subject="${params.subject}"${att}`,
    );
    return { id: null, stubbed: true };
  }

  const { data, error } = await resend.emails.send({
    from,
    to: params.to,
    subject: params.subject,
    html: params.html,
    ...(params.replyTo ? { replyTo: params.replyTo } : {}),
    ...(Object.keys(headers).length ? { headers } : {}),
    ...(params.attachments?.length
      ? { attachments: params.attachments.map((a) => ({ filename: a.filename, content: a.content.toString("base64") })) }
      : {}),
  });
  if (error) {
    console.error("[email] send failed", error);
    throw new Error(error.message);
  }
  return { id: data?.id ?? null, stubbed: false };
}
