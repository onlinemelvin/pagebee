import { describe, it, expect, vi } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("@/lib/modules/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/modules/finance", () => ({
  getFinanceSettings: vi.fn(),
  saveFinanceSettings: vi.fn(),
}));
vi.mock("@/lib/stripe/client", () => ({
  stripeConfigured: vi.fn(),
  getStripe: vi.fn(),
}));
// refreshAccountStatus and PaymentError come from service — mock its Stripe deps too
vi.mock("./service", async (importOriginal) => {
  const original = await importOriginal<typeof import("./service")>();
  return {
    ...original,
    refreshAccountStatus: vi.fn().mockResolvedValue(true),
  };
});

import { getOnboardingState, submitOnboarding, uploadIdentityDocument } from "./onboarding";
import { stripeConfigured, getStripe } from "@/lib/stripe/client";
import { getFinanceSettings, saveFinanceSettings } from "@/lib/modules/finance";
import { writeAudit } from "@/lib/modules/audit";
import { refreshAccountStatus } from "./service";

const mockStripeConfigured = stripeConfigured as ReturnType<typeof vi.fn>;
const mockGetStripe = getStripe as ReturnType<typeof vi.fn>;
const mockGetFinanceSettings = getFinanceSettings as ReturnType<typeof vi.fn>;
const mockSaveFinanceSettings = saveFinanceSettings as ReturnType<typeof vi.fn>;
const mockRefreshAccountStatus = refreshAccountStatus as ReturnType<typeof vi.fn>;

function makeStripeMock() {
  return {
    accounts: {
      retrieve: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      createPerson: vi.fn(),
      createExternalAccount: vi.fn(),
      listPersons: vi.fn(),
      updatePerson: vi.fn(),
    },
    files: {
      create: vi.fn(),
    },
  };
}

const VALID_ONBOARDING_INPUT = {
  businessType: "individual",
  country: "US",
  firstName: "Ada",
  lastName: "Owner",
  email: "ada@acme.com",
  phone: "5551234567",
  dobDay: 15,
  dobMonth: 6,
  dobYear: 1985,
  ssnLast4: "1234",
  addressLine1: "123 Main St",
  addressLine2: "",
  city: "Austin",
  state: "TX",
  postalCode: "78701",
  mcc: "7299",
  productDescription: "Plumbing services",
  businessName: "Acme Plumbing",
  bankToken: "btok_test_123",
  accountHolderName: "Ada Owner",
  tosAccepted: true as const,
};

// ─── getOnboardingState ──────────────────────────────────────────────────────

describe("getOnboardingState", () => {
  it("returns configured:false when Stripe is not set up", async () => {
    mockStripeConfigured.mockReturnValue(false);
    const state = await getOnboardingState("c1");
    expect(state.configured).toBe(false);
    expect(state.hasAccount).toBe(false);
  });

  it("returns hasAccount:false when client has no connected account", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.client.findUnique.mockResolvedValue({ stripeConnectAccountId: null } as never);
    const state = await getOnboardingState("c1");
    expect(state.configured).toBe(true);
    expect(state.hasAccount).toBe(false);
  });

  it("returns full state with chargesEnabled from Stripe", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.client.findUnique.mockResolvedValue({ stripeConnectAccountId: "acct_123" } as never);
    const stripe = makeStripeMock();
    stripe.accounts.retrieve.mockResolvedValue({
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      requirements: { currently_due: [], pending_verification: [], disabled_reason: null },
    });
    mockGetStripe.mockReturnValue(stripe);
    prismaMock.client.update.mockResolvedValue({} as never);

    const state = await getOnboardingState("c1");
    expect(state.configured).toBe(true);
    expect(state.hasAccount).toBe(true);
    expect(state.chargesEnabled).toBe(true);
    expect(state.payoutsEnabled).toBe(true);
    expect(state.detailsSubmitted).toBe(true);
  });

  it("maps currentlyDue fields to friendly requirement labels", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.client.findUnique.mockResolvedValue({ stripeConnectAccountId: "acct_123" } as never);
    const stripe = makeStripeMock();
    stripe.accounts.retrieve.mockResolvedValue({
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: false,
      requirements: {
        currently_due: ["external_account", "individual.dob.day"],
        pending_verification: [],
        disabled_reason: "requirements.past_due",
      },
    });
    mockGetStripe.mockReturnValue(stripe);
    prismaMock.client.update.mockResolvedValue({} as never);

    const state = await getOnboardingState("c1");
    expect(state.requirementLabels).toContain("A bank account for payouts");
    expect(state.requirementLabels).toContain("Your date of birth");
    expect(state.disabledReason).toBe("requirements.past_due");
  });

  it("sets needsDocument when a verification.document field is due", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.client.findUnique.mockResolvedValue({ stripeConnectAccountId: "acct_123" } as never);
    const stripe = makeStripeMock();
    stripe.accounts.retrieve.mockResolvedValue({
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: false,
      requirements: {
        currently_due: ["individual.verification.document.front"],
        pending_verification: [],
        disabled_reason: null,
      },
    });
    mockGetStripe.mockReturnValue(stripe);
    prismaMock.client.update.mockResolvedValue({} as never);

    const state = await getOnboardingState("c1");
    expect(state.needsDocument).toBe(true);
  });

  it("syncs paymentsEnabled to the DB based on Stripe account status", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.client.findUnique.mockResolvedValue({ stripeConnectAccountId: "acct_123" } as never);
    const stripe = makeStripeMock();
    stripe.accounts.retrieve.mockResolvedValue({
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      requirements: { currently_due: [], pending_verification: [], disabled_reason: null },
    });
    mockGetStripe.mockReturnValue(stripe);
    prismaMock.client.update.mockResolvedValue({} as never);

    await getOnboardingState("c1");

    expect(prismaMock.client.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { paymentsEnabled: true } }),
    );
  });
});

// ─── submitOnboarding ────────────────────────────────────────────────────────

describe("submitOnboarding", () => {
  it("throws when Stripe is not configured", async () => {
    mockStripeConfigured.mockReturnValue(false);
    await expect(submitOnboarding("c1", VALID_ONBOARDING_INPUT, "1.2.3.4")).rejects.toThrow("stripe_not_configured");
  });

  it("throws tier_required when client lacks payments/invoices feature flag", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.client.findUnique.mockResolvedValue({
      subscription: { plan: { featureFlags: {} } },
    } as never);
    await expect(submitOnboarding("c1", VALID_ONBOARDING_INPUT, "1.2.3.4")).rejects.toThrow("tier_required");
  });

  it("creates a Custom account for a new individual, stores accountId, and audits", async () => {
    mockStripeConfigured.mockReturnValue(true);
    // assertTier call
    prismaMock.client.findUnique
      .mockResolvedValueOnce({ subscription: { plan: { featureFlags: { payments: true } } } } as never)
      // The subsequent findUnique to get stripeConnectAccountId
      .mockResolvedValueOnce({ stripeConnectAccountId: null } as never)
      // getOnboardingState at the end
      .mockResolvedValueOnce({ stripeConnectAccountId: "acct_new" } as never);

    const stripe = makeStripeMock();
    stripe.accounts.create.mockResolvedValue({ id: "acct_new" });
    stripe.accounts.retrieve.mockResolvedValue({
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: false,
      requirements: { currently_due: [], pending_verification: [], disabled_reason: null },
    });
    mockGetStripe.mockReturnValue(stripe);
    prismaMock.client.update.mockResolvedValue({} as never);
    mockGetFinanceSettings.mockResolvedValue({ payoutProfile: {}, taxMode: "manual", taxRegistrationStates: [], taxCode: "" });
    mockSaveFinanceSettings.mockResolvedValue(undefined);
    mockRefreshAccountStatus.mockResolvedValue(true);

    await submitOnboarding("c1", VALID_ONBOARDING_INPUT, "1.2.3.4");

    // Must create a Custom account
    const createCall = stripe.accounts.create.mock.calls[0][0] as { type: string; capabilities: unknown };
    expect(createCall.type).toBe("custom");
    expect(createCall.capabilities).toEqual(
      expect.objectContaining({ card_payments: { requested: true }, transfers: { requested: true } }),
    );

    // Must persist accountId
    expect(prismaMock.client.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { stripeConnectAccountId: "acct_new" } }),
    );

    // Audit
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "payments.onboarding_submitted", clientId: "c1" }),
    );
  });

  it("creates a company account with person+representative for business type=company", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.client.findUnique
      .mockResolvedValueOnce({ subscription: { plan: { featureFlags: { invoices: true } } } } as never)
      .mockResolvedValueOnce({ stripeConnectAccountId: null } as never)
      .mockResolvedValueOnce({ stripeConnectAccountId: "acct_co" } as never);

    const stripe = makeStripeMock();
    stripe.accounts.create.mockResolvedValue({ id: "acct_co" });
    stripe.accounts.update.mockResolvedValue({});
    stripe.accounts.createPerson.mockResolvedValue({ id: "pers_1" });
    stripe.accounts.retrieve.mockResolvedValue({
      charges_enabled: false, payouts_enabled: false, details_submitted: false,
      requirements: { currently_due: [], pending_verification: [], disabled_reason: null },
    });
    mockGetStripe.mockReturnValue(stripe);
    prismaMock.client.update.mockResolvedValue({} as never);
    mockGetFinanceSettings.mockResolvedValue({ payoutProfile: {}, taxMode: "manual", taxRegistrationStates: [], taxCode: "" });
    mockSaveFinanceSettings.mockResolvedValue(undefined);
    mockRefreshAccountStatus.mockResolvedValue(true);

    await submitOnboarding("c1", { ...VALID_ONBOARDING_INPUT, businessType: "company", taxId: "123456789", idNumber: "123456789" }, "1.2.3.4");

    // createPerson must be called with representative relationship
    expect(stripe.accounts.createPerson).toHaveBeenCalledWith(
      "acct_co",
      expect.objectContaining({ relationship: expect.objectContaining({ representative: true, owner: true }) }),
    );
    // company fields declared complete
    expect(stripe.accounts.update).toHaveBeenCalledWith(
      "acct_co",
      expect.objectContaining({ company: expect.objectContaining({ owners_provided: true }) }),
    );
  });

  it("updates an existing account instead of creating one", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.client.findUnique
      .mockResolvedValueOnce({ subscription: { plan: { featureFlags: { payments: true } } } } as never)
      .mockResolvedValueOnce({ stripeConnectAccountId: "acct_existing" } as never)
      .mockResolvedValueOnce({ stripeConnectAccountId: "acct_existing" } as never);

    const stripe = makeStripeMock();
    stripe.accounts.update.mockResolvedValue({});
    stripe.accounts.createExternalAccount.mockResolvedValue({});
    stripe.accounts.retrieve.mockResolvedValue({
      charges_enabled: true, payouts_enabled: true, details_submitted: true,
      requirements: { currently_due: [], pending_verification: [], disabled_reason: null },
    });
    mockGetStripe.mockReturnValue(stripe);
    prismaMock.client.update.mockResolvedValue({} as never);
    mockGetFinanceSettings.mockResolvedValue({ payoutProfile: {}, taxMode: "manual", taxRegistrationStates: [], taxCode: "" });
    mockSaveFinanceSettings.mockResolvedValue(undefined);
    mockRefreshAccountStatus.mockResolvedValue(true);

    await submitOnboarding("c1", VALID_ONBOARDING_INPUT, "1.2.3.4");

    // Must NOT create a new account
    expect(stripe.accounts.create).not.toHaveBeenCalled();
    // Must update the existing one
    expect(stripe.accounts.update).toHaveBeenCalledWith("acct_existing", expect.any(Object));
    // And (re)attach the bank
    expect(stripe.accounts.createExternalAccount).toHaveBeenCalled();
  });

  it("normalises unsupported country to 'US'", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.client.findUnique
      .mockResolvedValueOnce({ subscription: { plan: { featureFlags: { payments: true } } } } as never)
      .mockResolvedValueOnce({ stripeConnectAccountId: null } as never)
      .mockResolvedValueOnce({ stripeConnectAccountId: "acct_us" } as never);

    const stripe = makeStripeMock();
    stripe.accounts.create.mockResolvedValue({ id: "acct_us" });
    stripe.accounts.retrieve.mockResolvedValue({
      charges_enabled: false, payouts_enabled: false, details_submitted: false,
      requirements: { currently_due: [], pending_verification: [], disabled_reason: null },
    });
    mockGetStripe.mockReturnValue(stripe);
    prismaMock.client.update.mockResolvedValue({} as never);
    mockGetFinanceSettings.mockResolvedValue({ payoutProfile: {}, taxMode: "manual", taxRegistrationStates: [], taxCode: "" });
    mockSaveFinanceSettings.mockResolvedValue(undefined);
    mockRefreshAccountStatus.mockResolvedValue(true);

    await submitOnboarding("c1", { ...VALID_ONBOARDING_INPUT, country: "ZZ" }, "1.2.3.4"); // ZZ not in SUPPORTED

    const createCall = stripe.accounts.create.mock.calls[0][0] as { country: string };
    expect(createCall.country).toBe("US");
  });
});

// ─── uploadIdentityDocument ──────────────────────────────────────────────────

describe("uploadIdentityDocument", () => {
  const FILE = { data: Buffer.from("fake-image"), name: "id.jpg", type: "image/jpeg" };

  it("throws when Stripe is not configured", async () => {
    mockStripeConfigured.mockReturnValue(false);
    await expect(uploadIdentityDocument("c1", "front", FILE)).rejects.toThrow("stripe_not_configured");
  });

  it("throws 404 when client has no connected account", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.client.findUnique.mockResolvedValue({ stripeConnectAccountId: null } as never);
    await expect(uploadIdentityDocument("c1", "front", FILE)).rejects.toThrow("no_account");
  });

  it("uploads the file and updates individual verification for individual accounts", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.client.findUnique
      .mockResolvedValueOnce({ stripeConnectAccountId: "acct_123" } as never)
      // For getOnboardingState at end
      .mockResolvedValueOnce({ stripeConnectAccountId: "acct_123" } as never);

    const stripe = makeStripeMock();
    stripe.files.create.mockResolvedValue({ id: "file_abc" });
    stripe.accounts.retrieve
      .mockResolvedValueOnce({ business_type: "individual" }) // for uploadIdentityDocument
      .mockResolvedValueOnce({ // for getOnboardingState at end
        charges_enabled: false, payouts_enabled: false, details_submitted: false,
        requirements: { currently_due: [], pending_verification: [], disabled_reason: null },
      });
    stripe.accounts.update.mockResolvedValue({});
    mockGetStripe.mockReturnValue(stripe);
    prismaMock.client.update.mockResolvedValue({} as never);
    mockRefreshAccountStatus.mockResolvedValue(false);

    await uploadIdentityDocument("c1", "front", FILE);

    expect(stripe.files.create).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: "identity_document" }),
      { stripeAccount: "acct_123" },
    );
    expect(stripe.accounts.update).toHaveBeenCalledWith(
      "acct_123",
      expect.objectContaining({ individual: { verification: { document: { front: "file_abc" } } } }),
    );
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "payments.document_uploaded", clientId: "c1", metadata: { side: "front" } }),
    );
  });

  it("updates person verification for company accounts", async () => {
    mockStripeConfigured.mockReturnValue(true);
    prismaMock.client.findUnique
      .mockResolvedValueOnce({ stripeConnectAccountId: "acct_co" } as never)
      .mockResolvedValueOnce({ stripeConnectAccountId: "acct_co" } as never);

    const stripe = makeStripeMock();
    stripe.files.create.mockResolvedValue({ id: "file_xyz" });
    stripe.accounts.retrieve
      .mockResolvedValueOnce({ business_type: "company" })
      .mockResolvedValueOnce({
        charges_enabled: false, payouts_enabled: false, details_submitted: false,
        requirements: { currently_due: [], pending_verification: [], disabled_reason: null },
      });
    stripe.accounts.listPersons.mockResolvedValue({
      data: [{ id: "pers_1", relationship: { representative: true } }],
    });
    stripe.accounts.updatePerson.mockResolvedValue({});
    mockGetStripe.mockReturnValue(stripe);
    prismaMock.client.update.mockResolvedValue({} as never);
    mockRefreshAccountStatus.mockResolvedValue(false);

    await uploadIdentityDocument("c1", "back", FILE);

    expect(stripe.accounts.updatePerson).toHaveBeenCalledWith(
      "acct_co",
      "pers_1",
      expect.objectContaining({ verification: { document: { back: "file_xyz" } } }),
    );
  });
});
