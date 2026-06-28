import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/modules/audit";
import { getFinanceSettings, saveFinanceSettings } from "@/lib/modules/finance";
import { getStripe, stripeConfigured } from "@/lib/stripe/client";
import { PaymentError, refreshAccountStatus } from "./service";
import { onboardingSubmitSchema } from "./schema";

const SUPPORTED = new Set(["US", "CA", "GB", "AU", "NZ", "IE", "DE", "FR", "ES", "IT", "NL", "SE", "SG", "AE", "IN"]);

/** Tier gate (Automate). Replicated here to throw PaymentError for the payments routes. */
async function assertTier(clientId: string): Promise<void> {
  const c = await prisma.client.findUnique({
    where: { id: clientId },
    select: { subscription: { select: { plan: { select: { featureFlags: true } } } } },
  });
  const flags = (c?.subscription?.plan.featureFlags ?? {}) as Record<string, unknown>;
  if (!(flags.invoices ?? flags.payments)) throw new PaymentError(403, "tier_required");
}

export interface OnboardingState {
  configured: boolean;
  hasAccount: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  disabledReason: string | null;
  currentlyDue: string[];
  pendingVerification: string[];
  needsDocument: boolean;
  requirementLabels: string[];
}

const EMPTY_STATE: OnboardingState = {
  configured: false,
  hasAccount: false,
  chargesEnabled: false,
  payoutsEnabled: false,
  detailsSubmitted: false,
  disabledReason: null,
  currentlyDue: [],
  pendingVerification: [],
  needsDocument: false,
  requirementLabels: [],
};

const REQ_LABELS: Record<string, string> = {
  external_account: "A bank account for payouts",
  "business_profile.url": "A business website or description",
  "business_profile.product_description": "A description of what you sell",
  "tos_acceptance.date": "Accept the terms",
};
function friendlyRequirement(field: string): string {
  if (REQ_LABELS[field]) return REQ_LABELS[field];
  if (field.includes("verification.document")) return "A photo of your ID (front/back)";
  if (field.includes("verification.additional_document")) return "An additional verification document";
  if (field.includes("id_number")) return "Your full SSN";
  if (field.includes("address")) return "Your address";
  if (field.includes("dob")) return "Your date of birth";
  if (field.includes("phone")) return "A phone number";
  if (field.includes("ssn_last_4")) return "The last 4 of your SSN";
  if (field.includes("tax_id")) return "Your business EIN";
  return field.replace(/_/g, " ").replace(/\./g, " — ");
}

/** Current onboarding/requirements state, syncing paymentsEnabled along the way. */
export async function getOnboardingState(clientId: string): Promise<OnboardingState> {
  if (!stripeConfigured()) return { ...EMPTY_STATE };
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { stripeConnectAccountId: true } });
  if (!client?.stripeConnectAccountId) return { ...EMPTY_STATE, configured: true };

  const acct = await getStripe().accounts.retrieve(client.stripeConnectAccountId);
  const req = acct.requirements;
  const currentlyDue = req?.currently_due ?? [];
  const pendingVerification = req?.pending_verification ?? [];
  const needsDocument = currentlyDue.some((f) => /verification\.(additional_)?document/.test(f));

  await prisma.client
    .update({ where: { id: clientId }, data: { paymentsEnabled: Boolean(acct.charges_enabled && acct.payouts_enabled) } })
    .catch(() => {});

  return {
    configured: true,
    hasAccount: true,
    chargesEnabled: Boolean(acct.charges_enabled),
    payoutsEnabled: Boolean(acct.payouts_enabled),
    detailsSubmitted: Boolean(acct.details_submitted),
    disabledReason: req?.disabled_reason ?? null,
    currentlyDue,
    pendingVerification,
    needsDocument,
    requirementLabels: [...new Set(currentlyDue.map(friendlyRequirement))],
  };
}

/** Create or update the Custom account from the PageBee-collected onboarding data + bank token + ToS. */
export async function submitOnboarding(clientId: string, input: unknown, ip: string | null): Promise<OnboardingState> {
  if (!stripeConfigured()) throw new PaymentError(503, "stripe_not_configured");
  await assertTier(clientId);
  const data = onboardingSubmitSchema.parse(input);
  const stripe = getStripe();
  const country = SUPPORTED.has(data.country.toUpperCase()) ? data.country.toUpperCase() : "US";

  const dob = { day: data.dobDay, month: data.dobMonth, year: data.dobYear };
  const address = {
    line1: data.addressLine1,
    line2: data.addressLine2 || undefined,
    city: data.city,
    state: data.state,
    postal_code: data.postalCode,
    country,
  };
  const tos: Stripe.AccountCreateParams.TosAcceptance = { date: Math.floor(Date.now() / 1000), ip: ip || "0.0.0.0" };

  const individualData: Stripe.AccountCreateParams.Individual = {
    first_name: data.firstName,
    last_name: data.lastName,
    email: data.email,
    phone: data.phone,
    dob,
    address,
    ssn_last_4: data.ssnLast4,
    id_number: data.idNumber,
  };

  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { stripeConnectAccountId: true } });
  let accountId = client?.stripeConnectAccountId ?? null;

  if (!accountId) {
    const params: Stripe.AccountCreateParams = {
      type: "custom",
      country,
      business_type: data.businessType,
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      business_profile: { mcc: data.mcc, product_description: data.productDescription, name: data.businessName || undefined },
      tos_acceptance: tos,
      external_account: data.bankToken,
      metadata: { clientId },
    };
    if (data.businessType === "individual") {
      params.individual = individualData;
    } else {
      params.company = {
        name: data.businessName || `${data.firstName} ${data.lastName}`,
        tax_id: data.taxId,
        address,
        phone: data.phone,
      };
    }
    const acct = await stripe.accounts.create(params);
    accountId = acct.id;
    await prisma.client.update({ where: { id: clientId }, data: { stripeConnectAccountId: accountId } });

    if (data.businessType === "company") {
      // A company needs a declared representative (and we treat them as sole owner/executive).
      await stripe.accounts.createPerson(accountId, {
        ...individualData,
        relationship: { representative: true, executive: true, owner: true, title: "Owner", percent_ownership: 100 },
      });
      await stripe.accounts.update(accountId, {
        company: { owners_provided: true, directors_provided: true, executives_provided: true },
      });
    }
  } else {
    // Update an existing account + (re)attach the bank.
    const upd: Stripe.AccountUpdateParams = {
      business_profile: { mcc: data.mcc, product_description: data.productDescription, name: data.businessName || undefined },
      tos_acceptance: tos,
    };
    if (data.businessType === "individual") upd.individual = individualData as Stripe.AccountUpdateParams.Individual;
    else upd.company = { name: data.businessName || undefined, tax_id: data.taxId, address, phone: data.phone };
    await stripe.accounts.update(accountId, upd);
    await stripe.accounts.createExternalAccount(accountId, { external_account: data.bankToken }).catch(() => {});
  }

  // Persist the non-sensitive bits for prefill next time (never SSN/EIN/bank).
  const settings = await getFinanceSettings(clientId);
  await saveFinanceSettings(clientId, {
    ...settings,
    payoutProfile: {
      ...settings.payoutProfile,
      businessType: data.businessType,
      country,
      legalName: data.businessName || "",
      mcc: data.mcc,
      productDescription: data.productDescription,
      firstName: data.firstName,
      lastName: data.lastName,
      dobDay: data.dobDay,
      dobMonth: data.dobMonth,
      dobYear: data.dobYear,
      addressLine1: data.addressLine1,
      addressLine2: data.addressLine2 || "",
      city: data.city,
      state: data.state,
      postalCode: data.postalCode,
    },
  });

  await refreshAccountStatus(clientId);
  await writeAudit({ action: "payments.onboarding_submitted", entityType: "Client", entityId: clientId, clientId });
  return getOnboardingState(clientId);
}

/** Upload an identity document (front/back) when Stripe requires one, then re-check requirements. */
export async function uploadIdentityDocument(
  clientId: string,
  side: "front" | "back",
  file: { data: Buffer; name: string; type: string },
): Promise<OnboardingState> {
  if (!stripeConfigured()) throw new PaymentError(503, "stripe_not_configured");
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { stripeConnectAccountId: true } });
  if (!client?.stripeConnectAccountId) throw new PaymentError(404, "no_account");
  const stripe = getStripe();
  const account = client.stripeConnectAccountId;

  const upload = await stripe.files.create(
    { file: { data: file.data, name: file.name, type: file.type }, purpose: "identity_document" },
    { stripeAccount: account },
  );

  const acct = await stripe.accounts.retrieve(account);
  if (acct.business_type === "company") {
    const persons = await stripe.accounts.listPersons(account, { limit: 10 });
    const rep = persons.data.find((p) => p.relationship?.representative) ?? persons.data[0];
    if (rep) await stripe.accounts.updatePerson(account, rep.id, { verification: { document: { [side]: upload.id } } });
  } else {
    await stripe.accounts.update(account, { individual: { verification: { document: { [side]: upload.id } } } });
  }

  await refreshAccountStatus(clientId);
  await writeAudit({ action: "payments.document_uploaded", entityType: "Client", entityId: clientId, clientId, metadata: { side } });
  return getOnboardingState(clientId);
}
