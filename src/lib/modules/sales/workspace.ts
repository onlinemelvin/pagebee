import { prisma } from "@/lib/db";
import { getRepContext } from "@/lib/auth/session";

export interface RepWorkspace {
  employee: { id: string; title: string | null };
  email: string;
  hasActiveContract: boolean;
  certified: boolean;
}

/**
 * Server-side resolver for the rep portal: the signed-in rep plus their gating state (signed
 * contract, certification). Returns null when the caller isn't an active rep — layouts redirect to
 * /login. Mirrors `getClientWorkspace` for the tenant side.
 */
export async function getRepWorkspace(): Promise<RepWorkspace | null> {
  const rep = await getRepContext();
  if (!rep) return null;
  const contract = await prisma.contract.findFirst({
    where: { employeeId: rep.employee.id, type: "SALES_REP_COMMISSION", status: "ACTIVE" },
    select: { id: true },
  });
  return {
    employee: { id: rep.employee.id, title: rep.employee.title },
    email: rep.ctx.email,
    hasActiveContract: Boolean(contract),
    certified: Boolean(rep.employee.certifiedAt),
  };
}
