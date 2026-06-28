import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("@/lib/modules/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAuthUser: vi.fn(),
  findAuthUserId: vi.fn(),
}));
vi.mock("@/lib/slug", () => ({ uniqueClientSlug: vi.fn() }));
vi.mock("@/lib/modules/email/notifications", () => ({ sendWelcome: vi.fn() }));

import { registerClient } from "./service";
import { writeAudit } from "@/lib/modules/audit";
import { createAuthUser, findAuthUserId } from "@/lib/supabase/admin";
import { uniqueClientSlug } from "@/lib/slug";
import * as notify from "@/lib/modules/email/notifications";

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
