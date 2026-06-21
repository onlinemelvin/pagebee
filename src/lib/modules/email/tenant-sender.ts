import { prisma } from "@/lib/db";
import { getFinanceSettings } from "@/lib/modules/finance";
import { getDomainState } from "@/lib/modules/website/domain";

/**
 * The branding + contact details an email sent on a client's behalf should carry.
 * Customer-facing email is branded as the CLIENT business, never as PageBee.
 */
export interface ClientBrand {
  clientId: string;
  businessName: string;
  slug: string;
  replyTo: string | null; // the client's real inbox — where customer replies land
  address: string | null; // physical address for the CAN-SPAM marketing footer
  phone: string | null;
  logoUrl: string | null;
  primaryColor: string; // hex
  websiteUrl: string | null; // the client's live site (custom domain or slug.<root>)
}

export interface ClientSender {
  from: string; // "Business Name <addr@domain>"
  replyTo: string | null;
  sendingDomain: string;
  usingCustomDomain: boolean;
}

const FALLBACK_AMBER = "#f59e0b";

/** Root domain for slug-based URLs/sending, port stripped (pagebee.com in prod). */
function rootDomain(): string {
  return (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "pagebee.com").replace(/:\d+$/, "");
}

/** Domain part of the platform's verified RESEND_FROM_EMAIL (a safe shared fallback). */
function resendFromDomain(): string {
  const m = (process.env.RESEND_FROM_EMAIL ?? "").match(/@([^>\s]+)>?/);
  return m?.[1] ?? "pagebee.com";
}

/**
 * The ONE shared, Resend-verified domain customer email goes out from when a
 * client has no verified domain of their own. Defaults to mail.<root>, but in
 * dev (localhost root) falls back to the verified RESEND_FROM_EMAIL domain so
 * sends actually deliver.
 */
export function sharedMailDomain(): string {
  if (process.env.CUSTOMER_MAIL_DOMAIN) return process.env.CUSTOMER_MAIL_DOMAIN;
  const root = rootDomain();
  if (root === "localhost" || root.startsWith("127.")) return resendFromDomain();
  return `mail.${root}`;
}

/** Quote a display name for an email From header if it contains header-significant chars. */
function quoteName(name: string): string {
  const clean = name.replace(/["\\\r\n]/g, "").trim();
  return /[",;:<>@]/.test(clean) ? `"${clean}"` : clean;
}

/** Sanitize a slug into a safe email local-part. */
function localPart(slug: string): string {
  return slug.toLowerCase().replace(/[^a-z0-9.-]/g, "").replace(/^[.-]+|[.-]+$/g, "").slice(0, 40) || "hello";
}

/** Load the client's branding + contact info for customer emails. */
export async function resolveClientBrand(clientId: string): Promise<ClientBrand | null> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      businessName: true,
      slug: true,
      ownerEmail: true,
      settings: { select: { branding: true } },
    },
  });
  if (!client) return null;

  // Business info from finance settings overrides the bare account fields.
  const fin = await getFinanceSettings(clientId).catch(() => null);
  const bi = fin?.businessInfo;
  const branding = (client.settings?.branding ?? {}) as { primaryColor?: string; logoUrl?: string };

  // Live site URL: active custom domain, else slug.<root>.
  const domainState = await getDomainState(clientId).catch(() => null);
  const liveHost = domainState?.status === "active" && domainState.domain ? domainState.domain : null;
  const websiteUrl = liveHost ? `https://${liveHost}` : `https://${client.slug}.${rootDomain()}`;

  return {
    clientId,
    businessName: (bi?.name || client.businessName).trim(),
    slug: client.slug,
    replyTo: (bi?.email || client.ownerEmail || "").trim() || null,
    address: bi?.address?.trim() || null,
    phone: bi?.phone?.trim() || null,
    logoUrl: branding.logoUrl || null,
    primaryColor: branding.primaryColor || FALLBACK_AMBER,
    websiteUrl,
  };
}

/**
 * Decide which domain a client's customer email sends FROM. Uses the client's
 * own domain only when a SendingDomain row is VERIFIED in Resend; otherwise the
 * shared platform domain, with the business name carrying the identity. Reply-to
 * is always the client's real inbox so customers can reply to the business.
 */
export async function resolveClientSender(brand: ClientBrand): Promise<ClientSender> {
  const verified = await prisma.sendingDomain.findFirst({
    where: { clientId: brand.clientId, status: "VERIFIED" },
    select: { domain: true },
  });

  const domain = verified?.domain ?? sharedMailDomain();
  const local = verified ? "hello" : localPart(brand.slug);
  const from = `${quoteName(brand.businessName)} <${local}@${domain}>`;

  return { from, replyTo: brand.replyTo, sendingDomain: domain, usingCustomDomain: Boolean(verified) };
}
