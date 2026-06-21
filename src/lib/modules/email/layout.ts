import { escapeHtml } from "./send";

/** Public app origin used to build links inside emails. */
export function appBase(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

const BRAND = {
  name: "PageBee",
  amber: "#f59e0b",
  ink: "#1c1917",
  muted: "#78716c",
  border: "#e7e5e4",
  bg: "#faf9f7",
};

export interface LayoutOptions {
  /** Inner HTML (already escaped/trusted) for the email body. */
  body: string;
  /** Pre-header text shown in the inbox preview line. */
  preheader?: string;
  /** When provided, renders the marketing unsubscribe footer with this link. */
  unsubscribeUrl?: string;
  /** Business / recipient name for the footer addressing line. */
  recipientLabel?: string;
}

/** A primary call-to-action button. `label`/`url` must be caller-trusted. */
export function button(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td style="border-radius:10px;background:${BRAND.amber}">
    <a href="${url}" style="display:inline-block;padding:12px 22px;border-radius:10px;color:${BRAND.ink};font-weight:700;font-size:15px;text-decoration:none">${escapeHtml(label)}</a>
  </td></tr></table>`;
}

/** A muted "or paste this link" fallback row for clients that strip buttons. */
export function linkFallback(url: string): string {
  return `<p style="color:${BRAND.muted};font-size:13px;line-height:1.5;word-break:break-all">Or paste this link into your browser:<br/><a href="${url}" style="color:${BRAND.amber}">${escapeHtml(url)}</a></p>`;
}

/**
 * Wrap inner body HTML in the branded PageBee email shell. Inline styles only —
 * email clients ignore <style>/external CSS. The unsubscribe footer is rendered
 * only for marketing mail (when unsubscribeUrl is supplied).
 */
export function renderLayout(opts: LayoutOptions): string {
  const preheader = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(opts.preheader)}</div>`
    : "";

  const unsub = opts.unsubscribeUrl
    ? `<p style="margin:16px 0 0;color:${BRAND.muted};font-size:12px;line-height:1.5">
        You're receiving tips & updates from PageBee${opts.recipientLabel ? ` for ${escapeHtml(opts.recipientLabel)}` : ""}.
        <a href="${opts.unsubscribeUrl}" style="color:${BRAND.muted};text-decoration:underline">Unsubscribe</a> from these.
      </p>`
    : "";

  return `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:32px 12px">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${BRAND.border};border-radius:16px;overflow:hidden">
      <tr><td style="padding:28px 32px 0">
        <span style="font-size:20px;font-weight:800;letter-spacing:-0.02em;color:${BRAND.ink}">Page<span style="color:${BRAND.amber}">Bee</span></span>
      </td></tr>
      <tr><td style="padding:20px 32px 28px;color:${BRAND.ink};font-size:15px;line-height:1.6">
        ${opts.body}
      </td></tr>
      <tr><td style="padding:20px 32px 28px;border-top:1px solid ${BRAND.border}">
        <p style="margin:0;color:${BRAND.muted};font-size:12px;line-height:1.5">PageBee — websites &amp; tools for local businesses.</p>
        ${unsub}
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}
