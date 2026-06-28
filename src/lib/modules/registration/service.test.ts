import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("@/lib/modules/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAuthUser: vi.fn(),
  findAuthUserId: vi.fn(),
}));
vi.mock("@/lib/slug", () => ({ uniqueClientSlug: vi.fn() }));
vi.mock("@/lib/modules/email/notifications", () => ({ sendWelcome: vi.fn() }));
vi.mock("@/lib/modules/preview", () => ({ approve: vi.fn() }));

import { registerClient, getPreviewClaim } from "./service";
import { writeAudit } from "@/lib/modules/audit";
import { createAuthUser, findAuthUserId } from "@/lib/supabase/admin";
import { uniqueClientSlug } from "@/lib/slug";
import * as notify from "@/lib/modules/email/notifications";
import { approve } from "@/lib/modules/preview";

const mockApprove = approve as ReturnType<typeof vi.fn>;

const mockCreateAuthUser = createAuthUser as ReturnType<typeof vi.fn>;
const mockFindAuthUserId = findAuthUserId as ReturnType<typeof vi.fn>;
const mockUniqueClientSlug = uniqueClientSlug as ReturnType<typeof vi.fn>;

const BASE_INPUT = {
  email: "owner@example.com",
  password: "securePassword123",
  businessName: "Acme Plumbing",
  businessType: "LLC",
  ownerName: "Ada Owner",
  phone: "555-1234",
  plan: "HONEY" as never,
};

beforeEach(() => {
  mockUniqueClientSlug.mockResolvedValue("acme-plumbing");
});

describe("registerClient — happy path (real account)", () => {
  it("creates Auth user, tenant, and subscription in a transaction", async () => {
    const plan = { id: "plan1", name: "HONEY", setupFee: 9900, monthlyFee: 4900 };
    prismaMock.plan.findUnique.mockResolvedValue(plan as never);
    prismaMock.user.findUnique.mockResolvedValue(null);
    mockCreateAuthUser.mockResolvedValue({ ok: true, id: "auth-u1" });

    // $transaction callback mock: invoke the callback with prismaMock
    prismaMock.$transaction.mockImplementation(async (cb: (tx: typeof prismaMock) => unknown) => {
      prismaMock.user.create.mockResolvedValue({ id: "u1" } as never);
      prismaMock.client.create.mockResolvedValue({ id: "c1", businessName: "Acme Plumbing" } as never);
      prismaMock.clientUser.create.mockResolvedValue({} as never);
      prismaMock.subscription.create.mockResolvedValue({} as never);
      return cb(prismaMock);
    });

    const result = await registerClient(BASE_INPUT);

    expect(result).toEqual({ clientId: "c1", isTest: false, plan: "HONEY" });
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: "owner@example.com", type: "CLIENT", supabaseUserId: "auth-u1" }),
      }),
    );
    expect(prismaMock.subscription.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "SETUP_PENDING", setupFeePaid: false, agreedSetupFee: 9900, agreedMonthlyFee: 4900 }),
      }),
    );
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "client.registered", clientId: "c1" }),
    );
  });

  it("sends a welcome email (fail-soft — doesn't block registration)", async () => {
    const plan = { id: "plan1", name: "HONEY", setupFee: 0, monthlyFee: 0 };
    prismaMock.plan.findUnique.mockResolvedValue(plan as never);
    prismaMock.user.findUnique.mockResolvedValue(null);
    mockCreateAuthUser.mockResolvedValue({ ok: true, id: "auth-u1" });
    prismaMock.$transaction.mockImplementation(async (cb: (tx: typeof prismaMock) => unknown) => {
      prismaMock.user.create.mockResolvedValue({ id: "u1" } as never);
      prismaMock.client.create.mockResolvedValue({ id: "c1" } as never);
      prismaMock.clientUser.create.mockResolvedValue({} as never);
      prismaMock.subscription.create.mockResolvedValue({} as never);
      return cb(prismaMock);
    });

    await registerClient(BASE_INPUT);
    expect(notify.sendWelcome).toHaveBeenCalledWith("c1");
  });
});

describe("registerClient — test account (@test.com)", () => {
  it("creates an ACTIVE subscription with setupFeePaid = true for test emails", async () => {
    const plan = { id: "plan2", name: "HIVE", setupFee: 0, monthlyFee: 0 };
    prismaMock.plan.findUnique.mockResolvedValue(plan as never);
    prismaMock.user.findUnique.mockResolvedValue(null);
    mockCreateAuthUser.mockResolvedValue({ ok: true, id: "auth-t1" });
    prismaMock.$transaction.mockImplementation(async (cb: (tx: typeof prismaMock) => unknown) => {
      prismaMock.user.create.mockResolvedValue({ id: "u2" } as never);
      prismaMock.client.create.mockResolvedValue({ id: "c2" } as never);
      prismaMock.clientUser.create.mockResolvedValue({} as never);
      prismaMock.subscription.create.mockResolvedValue({} as never);
      return cb(prismaMock);
    });

    const result = await registerClient({ ...BASE_INPUT, email: "tester@test.com" });

    expect(result.isTest).toBe(true);
    expect(prismaMock.subscription.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "ACTIVE", setupFeePaid: true }),
      }),
    );
    // isTest flag must propagate to the client row
    expect(prismaMock.client.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isTest: true }) }),
    );
  });

  it("normalises email to lowercase before storing", async () => {
    const plan = { id: "plan1", name: "HONEY", setupFee: 0, monthlyFee: 0 };
    prismaMock.plan.findUnique.mockResolvedValue(plan as never);
    prismaMock.user.findUnique.mockResolvedValue(null);
    mockCreateAuthUser.mockResolvedValue({ ok: true, id: "auth-u3" });
    prismaMock.$transaction.mockImplementation(async (cb: (tx: typeof prismaMock) => unknown) => {
      prismaMock.user.create.mockResolvedValue({ id: "u3" } as never);
      prismaMock.client.create.mockResolvedValue({ id: "c3" } as never);
      prismaMock.clientUser.create.mockResolvedValue({} as never);
      prismaMock.subscription.create.mockResolvedValue({} as never);
      return cb(prismaMock);
    });

    await registerClient({ ...BASE_INPUT, email: "OWNER@EXAMPLE.COM" });

    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: "owner@example.com" }) }),
    );
  });
});

describe("registerClient — preview claim (adopt provisional client)", () => {
  const CLAIM_INPUT = { ...BASE_INPUT, plan: undefined as never, previewToken: "tok-123" };
  const provisionalPreview = {
    id: "pv1",
    clientId: "prov-c1",
    prospectId: "p1",
    selectedPlan: "HONEY",
    client: { isTest: true, sourceQuoteId: null, _count: { users: 0 } },
  };

  function wireAdoptionTx() {
    prismaMock.$transaction.mockImplementation(async (cb: (tx: typeof prismaMock) => unknown) => {
      prismaMock.user.create.mockResolvedValue({ id: "u1" } as never);
      prismaMock.clientUser.create.mockResolvedValue({} as never);
      prismaMock.client.update.mockResolvedValue({} as never);
      prismaMock.subscription.update.mockResolvedValue({} as never);
      prismaMock.preview.update.mockResolvedValue({} as never);
      prismaMock.prospect.update.mockResolvedValue({} as never);
      return cb(prismaMock);
    });
  }

  beforeEach(() => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    mockCreateAuthUser.mockResolvedValue({ ok: true, id: "auth-claim" });
    mockApprove.mockResolvedValue({ launched: false, awaitingPayment: true });
  });

  it("adopts the provisional client, auto-approves, and lands on the launch step", async () => {
    prismaMock.preview.findUnique.mockResolvedValue(provisionalPreview as never);
    prismaMock.plan.findUnique.mockResolvedValue({ id: "plan1", name: "HONEY", setupFee: 9900, monthlyFee: 4900 } as never);
    wireAdoptionTx();

    const result = await registerClient(CLAIM_INPUT);

    expect(result).toEqual({ clientId: "prov-c1", isTest: false, plan: "HONEY", adopted: true, next: "/client/launch" });
    // Owner login is attached to the EXISTING provisional client — no new client created.
    expect(prismaMock.client.create).not.toHaveBeenCalled();
    expect(prismaMock.clientUser.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ clientId: "prov-c1", role: "owner" }) }),
    );
    // Flips test→real and surfaces the (possibly edited) business details.
    expect(prismaMock.client.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "prov-c1" }, data: expect.objectContaining({ isTest: false, ownerEmail: "owner@example.com", businessName: "Acme Plumbing" }) }),
    );
    // Preview flipped to PREVIEW_READY so approve() can take over.
    expect(prismaMock.preview.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "pv1" }, data: expect.objectContaining({ status: "PREVIEW_READY", selectedPlan: "HONEY" }) }),
    );
    expect(mockApprove).toHaveBeenCalledWith("prov-c1");
    expect(prismaMock.prospect.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "p1" }, data: { status: "closed" } }),
    );
    expect(notify.sendWelcome).toHaveBeenCalledWith("prov-c1");
  });

  it("defaults the plan to the preview's selected plan when none is supplied", async () => {
    prismaMock.preview.findUnique.mockResolvedValue(provisionalPreview as never);
    const planLookup = prismaMock.plan.findUnique.mockResolvedValue({ id: "plan1", name: "HONEY", setupFee: 0, monthlyFee: 0 } as never);
    wireAdoptionTx();

    await registerClient(CLAIM_INPUT);
    expect(planLookup).toHaveBeenCalledWith({ where: { name: "HONEY" } });
  });

  it("honours a form-chosen plan over the preview's selected plan", async () => {
    prismaMock.preview.findUnique.mockResolvedValue(provisionalPreview as never);
    const planLookup = prismaMock.plan.findUnique.mockResolvedValue({ id: "plan2", name: "HIVE", setupFee: 0, monthlyFee: 0 } as never);
    wireAdoptionTx();

    await registerClient({ ...CLAIM_INPUT, plan: "HIVE" as never });
    expect(planLookup).toHaveBeenCalledWith({ where: { name: "HIVE" } });
  });

  it("carries the preview's setup-fee discount onto the subscription (monthly untouched)", async () => {
    prismaMock.preview.findUnique.mockResolvedValue({ ...provisionalPreview, setupDiscountPct: 25 } as never);
    prismaMock.plan.findUnique.mockResolvedValue({ id: "plan1", name: "HONEY", setupFee: 69900, monthlyFee: 8900 } as never);
    wireAdoptionTx();

    await registerClient(CLAIM_INPUT);
    // 25% off the $699 setup → $524.25; monthly stays full.
    expect(prismaMock.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ agreedSetupFee: 52425, agreedMonthlyFee: 8900, promoMonthlyFee: null, promoMonths: null }) }),
    );
  });

  it("carries an approved monthly promo onto the subscription as a 12-month promotional rate", async () => {
    prismaMock.preview.findUnique.mockResolvedValue({ ...provisionalPreview, setupDiscountPct: 0, monthlyDiscountPct: 15 } as never);
    prismaMock.plan.findUnique.mockResolvedValue({ id: "plan1", name: "HONEY", setupFee: 69900, monthlyFee: 8900 } as never);
    wireAdoptionTx();

    await registerClient(CLAIM_INPUT);
    // 15% off the $89 monthly → $75.65 for 12 months; agreed (post-promo) monthly stays full.
    expect(prismaMock.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ agreedMonthlyFee: 8900, promoMonthlyFee: 7565, promoMonths: 12 }) }),
    );
  });

  it("falls back to the dashboard when auto-approve fails (account still created)", async () => {
    prismaMock.preview.findUnique.mockResolvedValue(provisionalPreview as never);
    prismaMock.plan.findUnique.mockResolvedValue({ id: "plan1", name: "HONEY", setupFee: 0, monthlyFee: 0 } as never);
    wireAdoptionTx();
    mockApprove.mockRejectedValue(new Error("not_ready"));

    const result = await registerClient(CLAIM_INPUT);
    expect(result).toMatchObject({ next: "/client/website", clientId: "prov-c1" });
  });

  it("404s when the preview token is unknown", async () => {
    prismaMock.preview.findUnique.mockResolvedValue(null);
    await expect(registerClient(CLAIM_INPUT)).rejects.toThrow("preview_not_found");
  });

  it("409s when the preview client has already been claimed", async () => {
    prismaMock.preview.findUnique.mockResolvedValue({
      ...provisionalPreview,
      client: { isTest: false, sourceQuoteId: null, _count: { users: 1 } },
    } as never);
    await expect(registerClient(CLAIM_INPUT)).rejects.toThrow("preview_claimed");
    expect(mockCreateAuthUser).not.toHaveBeenCalled();
  });

  it("still rejects a token claim when the email is already taken", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u-existing" } as never);
    await expect(registerClient(CLAIM_INPUT)).rejects.toThrow("email_taken");
    expect(prismaMock.preview.findUnique).not.toHaveBeenCalled();
  });
});

describe("getPreviewClaim", () => {
  it("returns prefill context for an unclaimed provisional preview", async () => {
    prismaMock.preview.findUnique.mockResolvedValue({
      selectedPlan: "HONEY",
      client: { isTest: true, sourceQuoteId: null, businessName: "Joe's", businessType: "Plumbing", ownerName: "Joe", ownerEmail: "joe@x.com", _count: { users: 0 } },
    } as never);

    const claim = await getPreviewClaim("tok-123");
    expect(claim).toEqual({
      previewToken: "tok-123",
      plan: "HONEY",
      businessName: "Joe's",
      businessType: "Plumbing",
      ownerName: "Joe",
      email: "joe@x.com",
      claimed: false,
    });
  });

  it("marks claimed=true once the preview client has an owner", async () => {
    prismaMock.preview.findUnique.mockResolvedValue({
      selectedPlan: "HONEY",
      client: { isTest: false, sourceQuoteId: null, businessName: "Joe's", businessType: null, ownerName: null, ownerEmail: null, _count: { users: 1 } },
    } as never);
    const claim = await getPreviewClaim("tok-123");
    expect(claim?.claimed).toBe(true);
  });

  it("returns null for an unknown token", async () => {
    prismaMock.preview.findUnique.mockResolvedValue(null);
    expect(await getPreviewClaim("nope")).toBeNull();
  });
});

describe("registerClient — error paths", () => {
  it("throws RegistrationError 400 when the plan is not found", async () => {
    prismaMock.plan.findUnique.mockResolvedValue(null);
    await expect(registerClient(BASE_INPUT)).rejects.toThrow("invalid_plan");
  });

  it("throws RegistrationError 409 when email already exists in the DB", async () => {
    prismaMock.plan.findUnique.mockResolvedValue({ id: "p1" } as never);
    prismaMock.user.findUnique.mockResolvedValue({ id: "u-existing" } as never);
    await expect(registerClient(BASE_INPUT)).rejects.toThrow("email_taken");
    expect(mockCreateAuthUser).not.toHaveBeenCalled();
  });

  it("throws RegistrationError 502 when Supabase returns an unexpected error", async () => {
    prismaMock.plan.findUnique.mockResolvedValue({ id: "p1" } as never);
    prismaMock.user.findUnique.mockResolvedValue(null);
    mockCreateAuthUser.mockResolvedValue({ ok: false, status: 500, error: "supabase_down" });
    await expect(registerClient(BASE_INPUT)).rejects.toThrow("supabase_down");
  });

  it("recovers from a 422 Supabase conflict by looking up the existing auth id", async () => {
    const plan = { id: "p1", name: "HONEY", setupFee: 0, monthlyFee: 0 };
    prismaMock.plan.findUnique.mockResolvedValue(plan as never);
    prismaMock.user.findUnique.mockResolvedValue(null);
    mockCreateAuthUser.mockResolvedValue({ ok: false, status: 422, error: "conflict" });
    mockFindAuthUserId.mockResolvedValue("existing-auth-id");
    prismaMock.$transaction.mockImplementation(async (cb: (tx: typeof prismaMock) => unknown) => {
      prismaMock.user.create.mockResolvedValue({ id: "u4" } as never);
      prismaMock.client.create.mockResolvedValue({ id: "c4" } as never);
      prismaMock.clientUser.create.mockResolvedValue({} as never);
      prismaMock.subscription.create.mockResolvedValue({} as never);
      return cb(prismaMock);
    });

    const result = await registerClient(BASE_INPUT);
    expect(result.clientId).toBe("c4");
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ supabaseUserId: "existing-auth-id" }) }),
    );
  });

  it("throws 409 when 422 conflict but findAuthUserId also returns nothing", async () => {
    prismaMock.plan.findUnique.mockResolvedValue({ id: "p1" } as never);
    prismaMock.user.findUnique.mockResolvedValue(null);
    mockCreateAuthUser.mockResolvedValue({ ok: false, status: 422, error: "conflict" });
    mockFindAuthUserId.mockResolvedValue(undefined);

    await expect(registerClient(BASE_INPUT)).rejects.toThrow("email_taken");
  });
});
