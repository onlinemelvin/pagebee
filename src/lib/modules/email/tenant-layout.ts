import { escapeHtml } from "./send";
import type { ClientBrand } from "./tenant-sender";

const INK = "#1c1917";
const BODY = "#44403c";
const MUTED = "#78716c";
const FAINT = "#a8a29e";
const BORDER = "#ececea";
const PANEL = "#faf9f7";
const BG = "#f4f2ee";

/** Pick readable text colour (dark/white) for a given hex background. */
function contrastText(hex: string): string {
  const m = hex.replace("#", "");
  const n = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const r = parseInt(n.slice(0, 2), 16) || 0;
  const g = parseInt(n.slice(2, 4), 16) || 0;
  const b = parseInt(n.slice(4, 6), 16) || 0;
  // Relative luminance — dark text on light backgrounds, white on dark.
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#1c1917" : "#ffffff";
}

/** A brand-coloured CTA button for customer emails. */
export function tButton(label: string, url: string, color: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px"><tr><td style="border-radius:12px;background:${color}">
    <a href="${url}" style="display:inline-block;padding:13px 26px;border-radius:12px;color:${contrastText(color)};font-weight:700;font-size:15px;text-decoration:none">${escapeHtml(label)}</a>
  </td></tr></table>`;
}

/** A neutral highlight panel (reused for "what to expect", notes, etc.). */
export function tPanel(body: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 6px"><tr><td style="background:${PANEL};border:1px solid ${BORDER};border-radius:12px;padding:16px 18px;color:${BODY};font-size:14px;line-height:1.6">${body}</td></tr></table>`;
}

export interface TenantLayoutOptions {
  brand: ClientBrand;
  body: string;
  preheader?: string;
  /** Marketing only — renders the unsubscribe link + physical address (CAN-SPAM). */
  unsubscribeUrl?: string;
}

/** The brand mark: the client's logo image if set, else their business name. */
function brandMark(brand: ClientBrand): string {
  if (brand.logoUrl) {
    return `<img src="${brand.logoUrl}" alt="${escapeHtml(brand.businessName)}" style="display:block;max-height:40px;width:auto;border:0" />`;
  }
  return `<span style="font-size:19px;font-weight:800;letter-spacing:-0.01em;color:${INK}">${escapeHtml(brand.businessName)}</span>`;
}

/**
 * Wrap customer-facing email body in a shell branded as the CLIENT business
 * (their logo/name + accent colour). The footer carries the business contact
 * details; marketing mail adds the physical address + unsubscribe (CAN-SPAM),
 * plus a small, tasteful "powered by PageBee" line.
 */
export function renderTenantLayout(opts: TenantLayoutOptions): string {
  const { brand } = opts;
  const accent = brand.primaryColor || "#f59e0b";

  const preheader = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(opts.preheader)}</div>
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${"&#847;&zwnj;&nbsp;".repeat(40)}</div>`
    : "";

  const contactBits = [
    brand.phone ? escapeHtml(brand.phone) : "",
    brand.websiteUrl ? `<a href="${brand.websiteUrl}" style="color:${MUTED};text-decoration:underline">${escapeHtml(brand.websiteUrl.replace(/^https?:\/\//, ""))}</a>` : "",
  ].filter(Boolean).join("&nbsp;&nbsp;·&nbsp;&nbsp;");

  const marketingFooter = opts.unsubscribeUrl
    ? `<p style="margin:10px 0 0;color:${FAINT};font-size:12px;line-height:1.55">
        ${brand.address ? `${escapeHtml(brand.address)}<br/>` : ""}
        You're receiving this because you're a customer of ${escapeHtml(brand.businessName)}.
        <a href="${opts.unsubscribeUrl}" style="color:${MUTED};text-decoration:underline">Unsubscribe</a>.
      </p>`
    : "";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="color-scheme" content="light"/></head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:34px 14px">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">

      <tr><td style="padding:4px 6px 18px">${brandMark(brand)}</td></tr>

      <tr><td style="background:#ffffff;border:1px solid ${BORDER};border-radius:18px;overflow:hidden">
        <div style="height:4px;background:${accent}"></div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="padding:32px 36px 34px;color:${BODY};font-size:15px;line-height:1.65">${opts.body}</td>
        </tr></table>
      </td></tr>

      <tr><td style="padding:22px 12px 8px">
        <p style="margin:0;color:${MUTED};font-size:13px;line-height:1.55;font-weight:700">${escapeHtml(brand.businessName)}</p>
        ${contactBits ? `<p style="margin:3px 0 0;color:${FAINT};font-size:12px;line-height:1.55">${contactBits}</p>` : ""}
        ${marketingFooter}
        <p style="margin:14px 0 0;color:${FAINT};font-size:11px">Powered by <a href="https://${(process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "pagebee.com").replace(/:\d+$/, "")}" style="color:${FAINT};text-decoration:underline">PageBee</a> 🐝</p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}
