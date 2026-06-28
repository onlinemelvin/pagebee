import { prisma } from "@/lib/db";
import type { Prisma, PlanName } from "@prisma/client";
import { createAuthUser, findAuthUserId } from "@/lib/supabase/admin";
import { uniqueClientSlug } from "@/lib/slug";
import { writeAudit } from "@/lib/modules/audit";
import * as notify from "@/lib/modules/email/notifications";
import { approve } from "@/lib/modules/preview";
import { MONTHLY_PROMO_MONTHS } from "@/lib/modules/sales/guardrails";
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

  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    throw new RegistrationError(409, "email_taken");
  }

  // Public preview claim ("Ready to launch") → adopt the provisional client behind the token instead
  // of creating a fresh tenant. Reuses the already-generated website + preview.
  if (input.previewToken) {
    return adoptPreviewClient(input, email, isTest);
  }

  const planName = (isTest ? (input.plan ?? "HIVE") : input.plan) as PlanName;
  const plan = await prisma.plan.findUnique({ where: { name: planName } });
  if (!plan) throw new RegistrationError(400, "invalid_plan");

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
        // Preview-before-you-pay: nothing is active until the preview is approved and
        // (for real accounts) the setup fee is paid. Test accounts launch free.
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

  // Branded welcome email (fail-soft — never block signup on email delivery).
  await notify.sendWelcome(client.id);

  return { clientId: client.id, isTest, plan: planName };
}

/**
 * Adopt the provisional client behind a public preview token as the real paying tenant: add the
 * owner login (auth + ClientUser), flip `isTest` off, set the chosen plan + agreed pricing, and
 * surface the (possibly edited) business details. The "Ready to launch" click is the prospect's
 * approval, so we mark the preview PREVIEW_READY and run the canonical `approve()` — which lands a
 * real account on the pay-to-launch step (`/client/launch`) or launches a test account outright.
 */
async function adoptPreviewClient(input: RegisterInput, email: string, isTest: boolean) {
  const preview = await prisma.preview.findUnique({
    where: { publicToken: input.previewToken! },
    select: {
      id: true,
      clientId: true,
      prospectId: true,
      selectedPlan: true,
      setupDiscountPct: true,
      monthlyDiscountPct: true,
      client: { select: { isTest: true, sourceQuoteId: true, _count: { select: { users: true } } } },
    },
  });
  if (!preview?.clientId || !preview.client) throw new RegistrationError(404, "preview_not_found");
  // A provisional preview client has no owner yet, is still flagged test, and isn't tied to a quote.
  // Anything else is an already-claimed tenant — don't let a second person claim it.
  if (!preview.client.isTest || preview.client.sourceQuoteId || preview.client._count.users > 0) {
    throw new RegistrationError(409, "preview_claimed");
  }
  const clientId = preview.clientId;

  // The plan defaults to the one the preview was generated for; the form may override it.
  const planName = (input.plan ?? preview.selectedPlan) as PlanName;
  const plan = await prisma.plan.findUnique({ where: { name: planName } });
  if (!plan) throw new RegistrationError(400, "invalid_plan");

  // Carry the rep's approved discounts onto the account (the figures the prospect saw on the preview
  // footer). The setup discount permanently lowers the one-time fee; an (always admin-approved)
  // monthly promo sets a time-boxed promotional rate for the first year, then reverts. Clamped 0–100.
  const setupPct = Math.max(0, Math.min(100, preview.setupDiscountPct ?? 0));
  const monthlyPct = Math.max(0, Math.min(100, preview.monthlyDiscountPct ?? 0));
  const agreedSetupFee = Math.round(plan.setupFee * (1 - setupPct / 100));
  const promoMonthlyFee = monthlyPct > 0 ? Math.round(plan.monthlyFee * (1 - monthlyPct / 100)) : null;
  const promoMonths = monthlyPct > 0 ? MONTHLY_PROMO_MONTHS : null;

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

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email, name: input.ownerName, type: "CLIENT", status: "ACTIVE", supabaseUserId },
    });
    await tx.clientUser.create({ data: { clientId, userId: user.id, role: "owner" } });
    await tx.client.update({
      where: { id: clientId },
      data: {
        isTest,
        ownerEmail: email,
        ownerName: input.ownerName,
        ownerPhone: input.phone,
        businessName: input.businessName,
        businessType: input.businessType,
        status: "active",
      },
    });
    await tx.subscription.update({
      where: { clientId },
      data: {
        planId: plan.id,
        status: isTest ? "ACTIVE" : "SETUP_PENDING",
        agreedSetupFee,
        agreedMonthlyFee: plan.monthlyFee,
        promoMonthlyFee,
        promoMonths,
        setupFeePaid: isTest,
      },
    });
    // Flip to PREVIEW_READY (its plan may have changed at claim time) so approve() can take over.
    await tx.preview.update({ where: { id: preview.id }, data: { status: "PREVIEW_READY", selectedPlan: planName } });
    if (preview.prospectId) {
      await tx.prospect.update({ where: { id: preview.prospectId }, data: { status: "closed" } });
    }
  });

  // Auto-approve: the "Ready to launch" click is the approval. Fail-soft — if it can't transition,
  // the account still exists and they can approve from the dashboard.
  let next = "/client/launch";
  try {
    await approve(clientId);
  } catch (err) {
    console.error("[register] auto-approve after preview claim failed", err);
    next = "/client/website";
  }

  await writeAudit({
    action: "client.registered",
    entityType: "Client",
    entityId: clientId,
    clientId,
    metadata: { isTest, plan: planName, adopted: true, previewId: preview.id } as Prisma.InputJsonValue,
  });
  await notify.sendWelcome(clientId);

  return { clientId, isTest, plan: planName, adopted: true as const, next };
}

/**
 * Prefill context for the "claim your preview" signup (the register page reads it when a
 * `?previewToken` is present). Returns null for an unknown token; `claimed: true` when the preview's
 * client has already been adopted (so the page falls back to a normal signup).
 */
export async function getPreviewClaim(token: string) {
  const preview = await prisma.preview.findUnique({
    where: { publicToken: token },
    select: {
      selectedPlan: true,
      client: {
        select: {
          isTest: true,
          sourceQuoteId: true,
          businessName: true,
          businessType: true,
          ownerName: true,
          ownerEmail: true,
          _count: { select: { users: true } },
        },
      },
    },
  });
  if (!preview?.client) return null;
  const claimed = !preview.client.isTest || Boolean(preview.client.sourceQuoteId) || preview.client._count.users > 0;
  return {
    previewToken: token,
    plan: preview.selectedPlan as PlanName,
    businessName: preview.client.businessName,
    businessType: preview.client.businessType ?? undefined,
    ownerName: preview.client.ownerName ?? undefined,
    email: preview.client.ownerEmail ?? undefined,
    claimed,
  };
}
