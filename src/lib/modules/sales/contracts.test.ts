import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("@/lib/modules/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/supabase/storage", () => ({ uploadPublicFile: vi.fn() }));
vi.mock("@/lib/modules/email/notifications", () => ({ sendRepContractSigned: vi.fn() }));
vi.mock("@/lib/modules/email", () => ({ appBase: () => "https://app.test" }));
vi.mock("./agreement-pdf", () => ({
  renderAgreementPdf: vi.fn(),
  agreementPdfFilename: () => "Sales-Rep-Commission-Agreement.pdf",
}));

import { signContract, getCommissionTerms, renderCommissionTerms } from "./contracts";
import { SalesError } from "./errors";
import { writeAudit } from "@/lib/modules/audit";
import { uploadPublicFile } from "@/lib/supabase/storage";
import { sendRepContractSigned } from "@/lib/modules/email/notifications";
import { renderAgreementPdf } from "./agreement-pdf";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getCommissionTerms", () => {
  it("falls back to documented defaults when no active plan exists", async () => {
    prismaMock.commissionPlan.findFirst.mockResolvedValue(null);
    const t = await getCommissionTerms();
    expect(t.bases).toEqual({ nectar: 60, honey: 200, hive: 500 });
    expect(t.clawbackDays).toBe(30);
    expect(t.floors.HONEY).toBe(599);
  });

  it("reads bases from the active CommissionPlan", async () => {
    prismaMock.commissionPlan.findFirst.mockResolvedValue({
      name: "Q3 plan",
      nectarBase: 70,
      honeyBase: 120,
      hiveBase: 200,
      recurringPct: 5,
      recurringMonths: 6,
      clawbackDays: 45,
    });
    const t = await getCommissionTerms();
    expect(t.planName).toBe("Q3 plan");
    expect(t.bases).toEqual({ nectar: 70, honey: 120, hive: 200 });
    expect(t.clawbackDays).toBe(45);
    expect(renderCommissionTerms(t)).toContain("5% of collected monthly fees for 6 months");
  });
});

describe("signContract", () => {
  it("activates a SENT contract, stamps signedAt, and audits the signatory", async () => {
    prismaMock.contract.findFirst.mockResolvedValue({ id: "k1", status: "SENT" });
    prismaMock.contract.update.mockResolvedValue({ id: "k1", status: "ACTIVE" });

    const result = await signContract("rep1", { fullName: "Jane Rep", agree: true }, { userId: "u1", ip: "1.2.3.4" });

    expect(result).toEqual({ id: "k1", status: "ACTIVE" });
    expect(prismaMock.contract.update).toHaveBeenCalledWith({
      where: { id: "k1" },
      data: { status: "ACTIVE", signedAt: expect.any(Date) },
    });
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "contract.signed",
        entityId: "k1",
        ip: "1.2.3.4",
        metadata: expect.objectContaining({ repId: "rep1", signatory: "Jane Rep" }),
      }),
    );
  });

  it("renders a PDF, stores it on the contract, and emails the rep a signed copy", async () => {
    prismaMock.contract.findFirst.mockResolvedValue({ id: "k1", status: "SENT", title: "Sales-Rep Commission Agreement", employeeId: "rep1" });
    prismaMock.contract.update.mockResolvedValue({ id: "k1", status: "ACTIVE", signedAt: new Date(), title: "Sales-Rep Commission Agreement" });
    prismaMock.employee.findUnique.mockResolvedValue({ user: { name: "Jane Rep", email: "jane@example.com" } });
    prismaMock.commissionPlan.findFirst.mockResolvedValue(null); // term defaults
    vi.mocked(renderAgreementPdf).mockResolvedValue(Buffer.from("pdf-bytes"));
    vi.mocked(uploadPublicFile).mockResolvedValue("https://store/agreement.pdf");

    await signContract("rep1", { fullName: "Jane Rep", agree: true }, { userId: "u1", ip: "1.2.3.4" });

    expect(renderAgreementPdf).toHaveBeenCalledWith(
      expect.objectContaining({ repName: "Jane Rep", repEmail: "jane@example.com", signatoryName: "Jane Rep", auditRef: "k1" }),
    );
    expect(uploadPublicFile).toHaveBeenCalledWith(
      expect.stringContaining("reps/rep1/agreement-k1-"),
      expect.any(Buffer),
      "application/pdf",
    );
    expect(prismaMock.contract.update).toHaveBeenCalledWith({ where: { id: "k1" }, data: { documentUrl: "https://store/agreement.pdf" } });
    expect(sendRepContractSigned).toHaveBeenCalledWith(
      "jane@example.com",
      expect.objectContaining({ name: "Jane Rep", pdf: expect.objectContaining({ filename: "Sales-Rep-Commission-Agreement.pdf" }) }),
    );
  });

  it("still signs (no throw) when PDF/storage/email delivery fails", async () => {
    prismaMock.contract.findFirst.mockResolvedValue({ id: "k1", status: "SENT", title: "Agreement", employeeId: "rep1" });
    prismaMock.contract.update.mockResolvedValue({ id: "k1", status: "ACTIVE", signedAt: new Date(), title: "Agreement" });
    prismaMock.employee.findUnique.mockResolvedValue({ user: { name: "Jane", email: "jane@example.com" } });
    prismaMock.commissionPlan.findFirst.mockResolvedValue(null);
    vi.mocked(renderAgreementPdf).mockRejectedValue(new Error("pdf boom"));

    const result = await signContract("rep1", { fullName: "Jane", agree: true });
    expect(result).toEqual({ id: "k1", status: "ACTIVE", signedAt: expect.any(Date), title: "Agreement" });
  });

  it("404 when the rep has no contract", async () => {
    prismaMock.contract.findFirst.mockResolvedValue(null);
    await expect(signContract("rep1", { fullName: "Jane Rep", agree: true })).rejects.toMatchObject({
      code: "contract_not_found",
      status: 404,
    });
  });

  it("409 when the contract is already active (no re-stamp)", async () => {
    prismaMock.contract.findFirst.mockResolvedValue({ id: "k1", status: "ACTIVE" });
    await expect(signContract("rep1", { fullName: "Jane Rep", agree: true })).rejects.toMatchObject({
      code: "already_signed",
      status: 409,
    });
    expect(prismaMock.contract.update).not.toHaveBeenCalled();
  });

  it("rejects when the agreement checkbox isn't accepted", async () => {
    await expect(signContract("rep1", { fullName: "Jane Rep", agree: false })).rejects.toBeTruthy();
  });
});
