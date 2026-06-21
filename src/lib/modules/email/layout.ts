import { escapeHtml } from "./send";

/** Public app origin used to build links inside emails. */
export function appBase(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

/**
 * Absolute URL of the logo mark for emails. Must be publicly reachable for mail
 * clients to load it — override with NEXT_PUBLIC_EMAIL_LOGO_URL when testing on
 * localhost (email clients can't fetch localhost). Falls back to the text
 * wordmark when the image is blocked.
 */
export function logoUrl(): string {
  return process.env.NEXT_PUBLIC_EMAIL_LOGO_URL || `${appBase()}/logo/pagebee-logo.png`;
}

const BRAND = {
  name: "PageBee",
  amber: "#f59e0b",
  amberDark: "#d97706",
  ink: "#1c1917",
  body: "#44403c",
  muted: "#78716c",
  faint: "#a8a29e",
  border: "#ececea",
  panel: "#faf9f7",
  bg: "#f4f2ee",
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

/** The brand wordmark as inline HTML: "Page" ink + "Bee" amber. */
function wordmark(): string {
  return `<span style="font-size:21px;font-weight:800;letter-spacing:-0.02em;vertical-align:middle"><span style="color:${BRAND.ink}">Page</span><span style="color:${BRAND.amber}">Bee</span></span>`;
}

/** A primary call-to-action button. `label`/`url` must be caller-trusted. */
export function button(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 8px"><tr><td style="border-radius:12px;background:${BRAND.amber};background-image:linear-gradient(180deg,${BRAND.amber},${BRAND.amberDark})">
    <a href="${url}" style="display:inline-block;padding:13px 26px;border-radius:12px;color:#3b2a06;font-weight:700;font-size:15px;text-decoration:none">${escapeHtml(label)} &nbsp;→</a>
  </td></tr></table>`;
}

/** A muted "or paste this link" fallback row for clients that strip buttons. */
export function linkFallback(url: string): string {
  return `<p style="color:${BRAND.muted};font-size:13px;line-height:1.5;word-break:break-all">Or paste this link into your browser:<br/><a href="${url}" style="color:${BRAND.amberDark}">${escapeHtml(url)}</a></p>`;
}

/** A highlighted callout panel for "what's next" / key info. `body` is trusted HTML. */
export function panel(body: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 6px"><tr><td style="background:${BRAND.panel};border:1px solid ${BRAND.border};border-radius:12px;padding:16px 18px;color:${BRAND.body};font-size:14px;line-height:1.6">${body}</td></tr></table>`;
}

/** A thin horizontal divider. */
export function divider(): string {
  return `<div style="height:1px;background:${BRAND.border};margin:22px 0"></div>`;
}

/**
 * A label/value detail table inside a panel (receipts, renewal, sign-in info).
 * Values are treated as trusted HTML — callers must escape user input.
 */
export function detailTable(rows: Array<[string, string]>): string {
  const inner = rows
    .map(
      ([k, v], i) =>
        `<tr>
          <td style="padding:${i ? "9px" : "0"} 0 9px;color:${BRAND.muted};font-size:13px;vertical-align:top;border-top:${i ? `1px solid ${BRAND.border}` : "0"}">${escapeHtml(k)}</td>
          <td style="padding:${i ? "9px" : "0"} 0 9px 18px;color:${BRAND.ink};font-size:14px;font-weight:600;text-align:right;vertical-align:top;border-top:${i ? `1px solid ${BRAND.border}` : "0"}">${v}</td>
        </tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 6px"><tr><td style="background:${BRAND.panel};border:1px solid ${BRAND.border};border-radius:12px;padding:6px 18px 7px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${inner}</table></td></tr></table>`;
}

/** A slim usage/progress bar (0–100). Colours shift green → amber → red. */
export function usageBar(pct: number): string {
  const w = Math.max(0, Math.min(100, Math.round(pct)));
  const color = w >= 90 ? "#dc2626" : w >= 75 ? BRAND.amber : "#10b981";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 16px"><tr><td style="background:#ececea;border-radius:999px;line-height:0;font-size:0">
    <table role="presentation" width="${w}%" cellpadding="0" cellspacing="0"><tr><td style="background:${color};border-radius:999px;height:10px;line-height:10px;font-size:0">&nbsp;</td></tr></table>
  </td></tr></table>`;
}

/**
 * Wrap inner body HTML in the branded PageBee email shell. Inline styles only —
 * email clients ignore <style>/external CSS. The unsubscribe footer is rendered
 * only for marketing mail (when unsubscribeUrl is supplied).
 */
export function renderLayout(opts: LayoutOptions): string {
  // Preheader = the inbox snippet. The spacer after it (zero-width chars) stops
  // the body/logo text from bleeding into the snippet after the preheader ends.
  const preheader = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(opts.preheader)}</div>
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${"&#847;&zwnj;&nbsp;".repeat(40)}</div>`
    : "";

  const unsub = opts.unsubscribeUrl
    ? `<p style="margin:14px 0 0;color:${BRAND.faint};font-size:12px;line-height:1.5">
        You're receiving tips &amp; updates from PageBee${opts.recipientLabel ? ` for ${escapeHtml(opts.recipientLabel)}` : ""}.<br/>
        <a href="${opts.unsubscribeUrl}" style="color:${BRAND.muted};text-decoration:underline">Unsubscribe</a> from these — you'll still get important account emails.
      </p>`
    : "";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="color-scheme" content="light"/></head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:34px 14px">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">

      <!-- Header: logo lockup -->
      <tr><td style="padding:4px 6px 18px">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="padding-right:9px;vertical-align:middle">
            <img src="${logoUrl()}" alt="" style="display:block;height:30px;width:auto;border:0" />
          </td>
          <td style="vertical-align:middle">${wordmark()}</td>
        </tr></table>
      </td></tr>

      <!-- Card -->
      <tr><td style="background:#ffffff;border:1px solid ${BRAND.border};border-radius:18px;overflow:hidden">
        <!-- Accent top rule -->
        <div style="height:4px;background:${BRAND.amber};background-image:linear-gradient(90deg,${BRAND.amber},${BRAND.amberDark})"></div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="padding:32px 36px 34px;color:${BRAND.body};font-size:15px;line-height:1.65">
            ${opts.body}
          </td>
        </tr></table>
      </td></tr>

      <!-- Footer -->
      <tr><td style="padding:22px 12px 8px">
        <p style="margin:0;color:${BRAND.muted};font-size:13px;line-height:1.55;font-weight:600">${wordmark()}</p>
        <p style="margin:4px 0 0;color:${BRAND.faint};font-size:12px;line-height:1.55">Websites &amp; tools that grow local businesses.</p>
        ${unsub}
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}
