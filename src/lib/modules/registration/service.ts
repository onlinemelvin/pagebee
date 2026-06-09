import { prisma } from "@/lib/db";
import type { Prisma, PlanName } from "@prisma/client";
import { createAuthUser, findAuthUserId } from "@/lib/supabase/admin";
import { uniqueClientSlug } from "@/lib/slug";
import { writeAudit } from "@/lib/modules/audit";
import { isTestEmail, type RegisterInput } from "./schema";

export class RegistrationError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

/**
 * Register a new client business: create the Supabase Auth identity, then the
 * tenant (Client), owner login (User + ClientUser), and Subscription.
 * Test signups (@test.com) get an active Automate plan with no payment;
 * real signups get their chosen plan in SETUP_PENDING (payment is a later slice).
 */
export async function registerClient(input: RegisterInput) {
  const email = input.email.trim().toLowerCase();
  const isTest = isTestEmail(email);
  const planName = (isTest ? (input.plan ?? "AUTOMATE") : input.plan) as PlanName;

  const plan = await prisma.plan.findUnique({ where: { name: planName } });
  if (!plan) throw new RegistrationError(400, "invalid_plan");

  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    throw new RegistrationError(409, "email_taken");
  }

  // Supabase Auth identity (auto-confirmed via the admin REST API).
  const created = await createAuthUser(email, input.password);
  let supabaseUserId: string | undefined;
  if (created.ok) {
    supabaseUserId = created.id;
  } else if (created.status === 422 || created.status === 409) {
    supabaseUserId = await findAuthUserId(email);
    if (!supabaseUserId) throw new RegistrationError(409, "email_taken");
  } else {
    throw new RegistrationError(502, created.error);
  }

  const slug = await uniqueClientSlug(input.businessName);

  const client = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email, name: input.ownerName, type: "CLIENT", status: "ACTIVE", supabaseUserId },
    });
    const newClient = await tx.client.create({
      data: {
        slug,
        businessName: input.businessName,
        businessType: input.businessType,
        ownerName: input.ownerName,
        ownerEmail: email,
        ownerPhone: input.phone,
        isTest,
        status: "active",
      },
    });
    await tx.clientUser.create({ data: { clientId: newClient.id, userId: user.id, role: "owner" } });
    await tx.subscription.create({
      data: {
        clientId: newClient.id,
        planId: plan.id,
        status: isTest ? "ACTIVE" : "SETUP_PENDING",
        agreedSetupFee: plan.setupFee,
        agreedMonthlyFee: plan.monthlyFee,
        setupFeePaid: isTest,
      },
    });
    return newClient;
  });

  await writeAudit({
    action: "client.registered",
    entityType: "Client",
    entityId: client.id,
    clientId: client.id,
    metadata: { isTest, plan: planName } as Prisma.InputJsonValue,
  });

  return { clientId: client.id, isTest, plan: planName };
}
