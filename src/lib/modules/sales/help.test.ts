import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("@/lib/modules/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/modules/email", () => ({ appBase: () => "https://app.test" }));
vi.mock("@/lib/modules/email/notifications", () => ({ sendAdminHelpRequest: vi.fn(async () => {}) }));

import { createHelpRequest, resolveHelpRequest } from "./help";
import { sendAdminHelpRequest } from "@/lib/modules/email/notifications";

beforeEach(() => {
  vi.clearAllMocks();
  // The global setup's resetAllMocks wipes this async mock's implementation; restore it so the
  // fail-soft `.catch` in createHelpRequest has a real promise to attach to.
  vi.mocked(sendAdminHelpRequest).mockResolvedValue(undefined as never);
});

describe("createHelpRequest", () => {
  it("records a ticket and emails the admin inbox (both channels)", async () => {
    prismaMock.employee.findUnique.mockResolvedValue({ user: { name: "Jane Rep", email: "jane@x.com" } });
    prismaMock.preview.findFirst.mockResolvedValue({ id: "pv1", prospectId: "p1", publicToken: "tok" });
    prismaMock.helpRequest.create.mockResolvedValue({ id: "hr1" });

    const res = await createHelpRequest("rep1", { message: "AI won't regenerate", previewId: "pv1" }, { userId: "u1" });

    expect(res).toEqual({ ok: true, id: "hr1" });
    expect(prismaMock.helpRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ employeeId: "rep1", repName: "Jane Rep", previewId: "pv1", message: "AI won't regenerate" }) }),
    );
    expect(sendAdminHelpRequest).toHaveBeenCalledWith(
      expect.objectContaining({ repName: "Jane Rep", previewUrl: "https://app.test/p/tok", inboxUrl: "https://app.test/admin/help" }),
    );
  });

  it("still records the ticket if the admin email fails (fail-soft)", async () => {
    prismaMock.employee.findUnique.mockResolvedValue({ user: { name: "Jane", email: "jane@x.com" } });
    prismaMock.helpRequest.create.mockResolvedValue({ id: "hr1" });
    vi.mocked(sendAdminHelpRequest).mockRejectedValueOnce(new Error("smtp down"));
    const res = await createHelpRequest("rep1", { message: "help" });
    expect(res).toEqual({ ok: true, id: "hr1" });
  });

  it("400 on empty message", async () => {
    await expect(createHelpRequest("rep1", { message: "  " })).rejects.toMatchObject({ code: "no_content", status: 400 });
  });
});

describe("resolveHelpRequest", () => {
  it("marks the ticket resolved", async () => {
    prismaMock.helpRequest.update.mockResolvedValue({ id: "hr1", status: "RESOLVED" });
    const res = await resolveHelpRequest("hr1", { userId: "u1" });
    expect(res).toEqual({ ok: true });
    expect(prismaMock.helpRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "hr1" }, data: expect.objectContaining({ status: "RESOLVED" }) }),
    );
  });
});
