import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("@/lib/modules/audit", () => ({ writeAudit: vi.fn() }));

import { createEmployee, updateEmployee, listEmployees } from "./employees";
import { PayrollError } from "./errors";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (arg: unknown) =>
    Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(prismaMock),
  );
});

describe("listEmployees", () => {
  it("filters to payroll-eligible types (excludes commission reps)", async () => {
    prismaMock.employee.findMany.mockResolvedValue([]);
    await listEmployees();
    const where = prismaMock.employee.findMany.mock.calls[0][0].where;
    expect(where.employeeType.in).toContain("SALARIED");
    expect(where.employeeType.in).not.toContain("COMMISSION_REP");
  });
});

describe("createEmployee", () => {
  it("creates a User (INVITED) + Employee with comp", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({ id: "u1" });
    prismaMock.employee.create.mockResolvedValue({
      id: "e1",
      title: "Engineer",
      employeeType: "SALARIED",
      compensationType: "SALARY",
      employmentStatus: "ACTIVE",
      baseSalary: 4000,
      hourlyRate: null,
      user: { name: "Pat", email: "pat@co.com" },
    });

    const row = await createEmployee({ name: "Pat", email: "Pat@Co.com", employeeType: "SALARIED", compensationType: "SALARY", title: "Engineer", baseSalary: 4000 });
    expect(row).toMatchObject({ id: "e1", name: "Pat", baseSalary: 4000 });
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: "pat@co.com", type: "PLATFORM", status: "INVITED" }) }),
    );
    expect(prismaMock.employee.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ employeeType: "SALARIED", userId: "u1" }) }),
    );
  });

  it("409 when the email exists", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "existing" });
    await expect(
      createEmployee({ name: "Pat", email: "pat@co.com", employeeType: "HOURLY", compensationType: "HOURLY" }),
    ).rejects.toMatchObject({ code: "email_taken", status: 409 });
  });

  it("rejects a commission-rep type (not payroll-eligible)", async () => {
    await expect(
      createEmployee({ name: "Pat", email: "pat@co.com", employeeType: "COMMISSION_REP", compensationType: "COMMISSION" }),
    ).rejects.toBeTruthy();
  });
});

describe("updateEmployee", () => {
  it("sets endDate when terminating", async () => {
    prismaMock.employee.findFirst.mockResolvedValue({ id: "e1" });
    prismaMock.employee.update.mockResolvedValue({
      id: "e1", title: null, employeeType: "SALARIED", compensationType: "SALARY", employmentStatus: "TERMINATED", baseSalary: 0, hourlyRate: 0, user: { name: "Pat", email: "p@c.com" },
    });
    await updateEmployee("e1", { employmentStatus: "TERMINATED" });
    expect(prismaMock.employee.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ employmentStatus: "TERMINATED", endDate: expect.any(Date) }) }),
    );
  });

  it("404 for a non-payroll employee", async () => {
    prismaMock.employee.findFirst.mockResolvedValue(null);
    await expect(updateEmployee("x", { title: "X" })).rejects.toBeInstanceOf(PayrollError);
  });
});
