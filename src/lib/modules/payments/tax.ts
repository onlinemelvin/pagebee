import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/modules/audit";
import { getFinanceSettings, saveFinanceSettings } from "@/lib/modules/finance";
import { getStripe, stripeConfigured } from "@/lib/stripe/client";
import { PaymentError } from "./service";

export interface TaxStatus {
  configured: boolean; // platform Stripe keys present
  available: boolean; // client has a connected account (PageBee Pay)
  active: boolean; // Stripe Tax settings active on the account
  mode: "manual" | "automatic";
  registeredStates: string[];
}

async function account(clientId: string): Promise<string | null> {
  const c = await prisma.client.findUnique({ where: { id: clientId }, select: { stripeConnectAccountId: true } });
  return c?.stripeConnectAccountId ?? null;
}

export async function getTaxStatus(clientId: string): Promise<TaxStatus> {
  const settings = await getFinanceSettings(clientId);
  const base: TaxStatus = { configured: stripeConfigured(), available: false, active: false, mode: settings.taxMode, registeredStates: settings.taxRegistrationStates };
  if (!stripeConfigured()) return base;
  const acct = await account(clientId);
  if (!acct) return base;
  base.available = true;
  try {
    const stripe = getStripe();
    const s = await stripe.tax.settings.retrieve({}, { stripeAccount: acct });
    base.active = s.status === "active";
    const regs = await stripe.tax.registrations.list({ limit: 100 }, { stripeAccount: acct });
    base.registeredStates = regs.data
      .filter((r) => r.status === "active")
      .map((r) => r.country_options?.us?.state)
      .filter((x): x is string => Boolean(x));
  } catch {
    // Stripe Tax may not be initialized yet — treat as not-active.
  }
  return base;
}

/**
 * Turn on automatic tax for the client's connected account: set the head-office origin + default
 * tax code, then reconcile the set of US-state registrations to exactly `states`.
 */
export async function syncTaxRegistrations(clientId: string, states: string[]): Promise<TaxStatus> {
  if (!stripeConfigured()) throw new PaymentError(503, "stripe_not_configured");
  const acct = await account(clientId);
  if (!acct) throw new PaymentError(409, "no_account");
  const stripe = getStripe();
  const settings = await getFinanceSettings(clientId);
  const p = settings.payoutProfile;
  const wanted = [...new Set(states.map((s) => s.toUpperCase()))];

  // Activate Stripe Tax with the business's address as the tax origin.
  await stripe.tax.settings.update(
    {
      defaults: { tax_code: settings.taxCode || "txcd_99999999", tax_behavior: "exclusive" },
      head_office: {
        address: { line1: p.addressLine1 || undefined, city: p.city || undefined, state: p.state || undefined, postal_code: p.postalCode || undefined, country: p.country || "US" },
      },
    },
    { stripeAccount: acct },
  );

  // Reconcile registrations.
  const existing = await stripe.tax.registrations.list({ limit: 100 }, { stripeAccount: acct });
  const activeRegs = existing.data.filter((r) => r.status === "active");
  const have = new Map(activeRegs.map((r) => [r.country_options?.us?.state, r.id] as const));
  for (const st of wanted) {
    if (!have.has(st)) {
      await stripe.tax.registrations
        .create({ country: "US", country_options: { us: { state: st, type: "state_sales_tax" } }, active_from: "now" }, { stripeAccount: acct })
        .catch((e) => console.error("[tax] register", st, (e as Error).message));
    }
  }
  for (const [st, id] of have) {
    if (st && id && !wanted.includes(st)) {
      await stripe.tax.registrations.update(id, { expires_at: "now" }, { stripeAccount: acct }).catch(() => {});
    }
  }

  await saveFinanceSettings(clientId, { ...settings, taxMode: "automatic", taxRegistrationStates: wanted });
  await writeAudit({ action: "finance.tax_registrations_synced", entityType: "Client", entityId: clientId, clientId, metadata: { states: wanted } });
  return getTaxStatus(clientId);
}

export interface TaxLine {
  amount: number; // cents, post-discount, pre-tax
  reference: string;
  taxCode?: string;
}
export interface TaxResult {
  tax: number;
  lineTax: Record<string, number>;
  calculationId: string | null;
}

/** Compute tax via Stripe Tax for the connected account. Returns zero tax if it can't (no address/account). */
export async function calculateTax(
  clientId: string,
  input: { currency: string; lines: TaxLine[]; address: { line1?: string; city?: string; state?: string; postalCode?: string; country?: string } },
): Promise<TaxResult> {
  const empty: TaxResult = { tax: 0, lineTax: {}, calculationId: null };
  if (!stripeConfigured()) return empty;
  const acct = await account(clientId);
  if (!acct) return empty;
  const addr = input.address;
  if (!addr.country || (!addr.postalCode && !addr.state)) return empty; // not enough to locate the customer
  const settings = await getFinanceSettings(clientId);

  const calc = await getStripe().tax.calculations.create(
    {
      currency: input.currency,
      line_items: input.lines.map((l) => ({ amount: l.amount, reference: l.reference, tax_code: l.taxCode || settings.taxCode || "txcd_99999999", tax_behavior: "exclusive" })),
      customer_details: {
        address: { line1: addr.line1 || undefined, city: addr.city || undefined, state: addr.state || undefined, postal_code: addr.postalCode || undefined, country: addr.country },
        address_source: "billing",
      },
    },
    { stripeAccount: acct },
  );
  const lineTax: Record<string, number> = {};
  for (const li of calc.line_items?.data ?? []) if (li.reference) lineTax[li.reference] = li.amount_tax;
  return { tax: calc.tax_amount_exclusive, lineTax, calculationId: calc.id };
}

/** File the calculated tax as a Stripe Tax transaction once the invoice is paid (for reporting). */
export async function recordTaxTransaction(clientId: string, calculationId: string, reference: string): Promise<void> {
  if (!stripeConfigured()) return;
  const acct = await account(clientId);
  if (!acct) return;
  await getStripe()
    .tax.transactions.createFromCalculation({ calculation: calculationId, reference }, { stripeAccount: acct })
    .catch((e) => console.error("[tax] record transaction", (e as Error).message));
}
