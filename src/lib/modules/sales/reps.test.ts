import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("@/lib/modules/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAuthUser: vi.fn(), findAuthUserId: vi.fn(), deleteAuthUser: vi.fn() }));
vi.mock("@/lib/modules/auth/tokens", () => ({ createAuthToken: vi.fn().mockResolvedValue("prt_tok") }));
vi.mock("@/lib/modules/email/notifications", () => ({ sendRepInvite: vi.fn() }));
vi.mock("@/lib/modules/email", () => ({ appBase: () => "https://app.test" }));

import { provisionRep, listReps, certifyRep, deleteRep } from "./reps";
import { SalesError } from "./errors";
import { createAuthUser, deleteAuthUser } from "@/lib/supabase/admin";
import { createAuthToken } from "@/lib/modules/auth/tokens";
import { sendRepInvite } from "@/lib/modules/email/notifications";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("provisionRep", () => {
  // resetAllMocks wipes the prisma mock's lazily-created $transaction implementation between tests;
  // re-establish the interactive-callback form so the tx body actually runs here.
  beforeEach(() => {
    prismaMock.$transaction.mockImplementation(async (arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: typeof prismaMock) => unknown)(prismaMock),
    );
    vi.mocked(createAuthToken).mockResolvedValue("prt_tok");
  });

  function wireHappyPath() {
    prismaMock.user.findUnique.mockResolvedValue(null);
    vi.mocked(createAuthUser).mockResolvedValue({ ok: true, id: "sb-1" });
    prismaMock.commissionPlan.findFirst.mockResolvedValue(null); // defaults
    prismaMock.role.upsert.mockResolvedValue({ id: "role-rep" });
    prismaMock.user.create.mockResolvedValue({ id: "u1" });
    prismaMock.userRole.create.mockResolvedValue({});
    prismaMock.employee.create.mockResolvedValue({ id: "rep1" });
    prismaMock.contract.create.mockResolvedValue({ id: "k1" });
  }

  it("creates the auth identity, PLATFORM user + rep employee, and a SENT contract", async () => {
    wireHappyPath();
    const result = await provisionRep(
      { name: "Jane Rep", email: "Jane@Example.com", title: "Closer" },
      { userId: "admin1" },
    );

    expect(result).toEqual({ userId: "u1", repId: "rep1", contractId: "k1" });
    // No admin-supplied password — a random throwaway is generated for the auth provider.
    expect(createAuthUser).toHaveBeenCalledWith("jane@example.com", expect.any(String));
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "PLATFORM", email: "jane@example.com", supabaseUserId: "sb-1" }) }),
    );
    expect(prismaMock.employee.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ employeeType: "COMMISSION_REP", userId: "u1" }) }),
    );
    expect(prismaMock.contract.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "SALES_REP_COMMISSION", status: "SENT", employeeId: "rep1" }) }),
    );
  });

  it("emails the new rep a secure set-password invite link", async () => {
    wireHappyPath();
    await provisionRep({ name: "Jane Rep", email: "Jane@Example.com" }, { userId: "admin1" });

    expect(createAuthToken).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", email: "jane@example.com", type: "REP_INVITE" }),
    );
    expect(sendRepInvite).toHaveBeenCalledWith(
      "jane@example.com",
      expect.objectContaining({ setPasswordUrl: "https://app.test/reset-password/prt_tok", portalUrl: "https://app.test/rep", userId: "u1" }),
    );
  });

  it("still provisions the rep when the invite email fails (fail-soft)", async () => {
    wireHappyPath();
    vi.mocked(sendRepInvite).mockRejectedValueOnce(new Error("smtp down"));
    const result = await provisionRep({ name: "Jane", email: "jane@example.com" });
    expect(result).toEqual({ userId: "u1", repId: "rep1", contractId: "k1" });
  });

  it("409 when the email already belongs to a user", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "existing" });
    await expect(
      provisionRep({ name: "Jane", email: "jane@example.com" }),
    ).rejects.toMatchObject({ code: "email_taken", status: 409 });
    expect(createAuthUser).not.toHaveBeenCalled();
  });

  it("surfaces auth-provider failures as a 502", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    vi.mocked(createAuthUser).mockResolvedValue({ ok: false, status: 500, error: "auth_down" });
    await expect(
      provisionRep({ name: "Jane", email: "jane@example.com" }),
    ).rejects.toBeInstanceOf(SalesError);
  });

  it("rejects invalid input (bad email)", async () => {
    await expect(
      provisionRep({ name: "Jane", email: "not-an-email" }),
    ).rejects.toBeTruthy();
  });
});

describe("certifyRep", () => {
  it("stamps certifiedAt when certifying", async () => {
    prismaMock.employee.findFirst.mockResolvedValue({ id: "rep1" });
    prismaMock.employee.update.mockResolvedValue({ id: "rep1", certifiedAt: new Date() });
    await certifyRep("rep1", true, { userId: "admin1" });
    expect(prismaMock.employee.update).toHaveBeenCalledWith({
      where: { id: "rep1" },
      data: { certifiedAt: expect.any(Date) },
    });
  });

  it("clears certifiedAt when decertifying", async () => {
    prismaMock.employee.findFirst.mockResolvedValue({ id: "rep1" });
    prismaMock.employee.update.mockResolvedValue({ id: "rep1", certifiedAt: null });
    await certifyRep("rep1", false);
    expect(prismaMock.employee.update).toHaveBeenCalledWith({ where: { id: "rep1" }, data: { certifiedAt: null } });
  });

  it("404 for a non-rep employee id", async () => {
    prismaMock.employee.findFirst.mockResolvedValue(null);
    await expect(certifyRep("x", true)).rejects.toMatchObject({ code: "rep_not_found", status: 404 });
  });
});

describe("deleteRep", () => {
  // resetAllMocks wipes the prisma mock's lazily-created $transaction implementation between tests;
  // re-establish the interactive-callback form so the tx body actually runs here.
  beforeEach(() => {
    prismaMock.$transaction.mockImplementation(async (arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: typeof prismaMock) => unknown)(prismaMock),
    );
  });

  function wireRep(overrides: Record<string, unknown> = {}) {
    prismaMock.employee.findFirst.mockResolvedValue({
      id: "rep1",
      userId: "u1",
      user: { email: "jane@example.com", supabaseUserId: "sb-1" },
      _count: { commissionRecords: 0 },
      ...overrides,
    });
  }

  it("deletes the rep's quotes, assignments, contracts, employee + login, and the auth user", async () => {
    wireRep();
    const result = await deleteRep("rep1", { actor: { userId: "admin1" } });

    expect(result).toEqual({ id: "rep1" });
    expect(prismaMock.quote.deleteMany).toHaveBeenCalledWith({ where: { salesRepId: "rep1" } });
    expect(prismaMock.salesAssignment.deleteMany).toHaveBeenCalledWith({ where: { employeeId: "rep1" } });
    expect(prismaMock.contract.deleteMany).toHaveBeenCalledWith({ where: { employeeId: "rep1" } });
    expect(prismaMock.employee.delete).toHaveBeenCalledWith({ where: { id: "rep1" } });
    expect(prismaMock.userRole.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
    expect(prismaMock.user.delete).toHaveBeenCalledWith({ where: { id: "u1" } });
    expect(deleteAuthUser).toHaveBeenCalledWith("sb-1");
    // Without force, commission records are left untouched.
    expect(prismaMock.commissionRecord.deleteMany).not.toHaveBeenCalled();
  });

  it("404 for a non-rep employee id", async () => {
    prismaMock.employee.findFirst.mockResolvedValue(null);
    await expect(deleteRep("x")).rejects.toMatchObject({ code: "rep_not_found", status: 404 });
  });

  it("refuses a rep with commission history unless forced", async () => {
    wireRep({ _count: { commissionRecords: 3 } });
    await expect(deleteRep("rep1")).rejects.toMatchObject({ code: "rep_has_commissions", status: 409 });
    expect(prismaMock.employee.delete).not.toHaveBeenCalled();
  });

  it("force also wipes commission records", async () => {
    wireRep({ _count: { commissionRecords: 3 } });
    await deleteRep("rep1", { force: true });
    expect(prismaMock.commissionRecord.deleteMany).toHaveBeenCalledWith({ where: { employeeId: "rep1" } });
    expect(prismaMock.employee.delete).toHaveBeenCalledWith({ where: { id: "rep1" } });
  });
});

describe("listReps", () => {
  it("maps employees to summary rows with contract status + counts", async () => {
    prismaMock.employee.findMany.mockResolvedValue([
      {
        id: "rep1",
        title: "Closer",
        employmentStatus: "ACTIVE",
        certifiedAt: null,
        user: { name: "Jane Rep", email: "jane@example.com" },
        contracts: [{ status: "ACTIVE" }],
        _count: { salesAssignments: 8, commissionRecords: 3 },
      },
    ]);
    const reps = await listReps();
    expect(reps[0]).toEqual({
      id: "rep1",
      name: "Jane Rep",
      email: "jane@example.com",
      title: "Closer",
      status: "ACTIVE",
      contractStatus: "ACTIVE",
      certified: false,
      prospects: 8,
      conversions: 3,
    });
  });
});
