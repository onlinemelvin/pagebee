import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const resend = apiKey ? new Resend(apiKey) : null;

const DEFAULT_FROM = process.env.RESEND_FROM_EMAIL ?? "PageBee <noreply@pagebee.com>";

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
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
 * Centralized email send (docs/ARCHITECTURE.md §8.8). Falls back to console
 * logging when RESEND_API_KEY is unset, so dev works without a Resend account.
 */
export async function sendEmail(params: SendEmailParams): Promise<{ id: string | null; stubbed: boolean }> {
  const from = params.from ?? DEFAULT_FROM;

  if (!resend) {
    console.log(
      `[email:stub] to=${params.to} from="${from}"${params.replyTo ? ` replyTo=${params.replyTo}` : ""} subject="${params.subject}"`,
    );
    return { id: null, stubbed: true };
  }

  const { data, error } = await resend.emails.send({
    from,
    to: params.to,
    subject: params.subject,
    html: params.html,
    ...(params.replyTo ? { replyTo: params.replyTo } : {}),
  });
  if (error) {
    console.error("[email] send failed", error);
    throw new Error(error.message);
  }
  return { id: data?.id ?? null, stubbed: false };
}
