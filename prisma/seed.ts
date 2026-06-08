import { PrismaClient, type Prisma } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { PLANS } from "../src/lib/plans";
import { DEMO_SITE_TOKEN } from "../src/lib/constants";

const prisma = new PrismaClient();

/**
 * Provision the platform admin: create (or find) the Supabase Auth user, then
 * link a PLATFORM User with the ADMIN role. Skipped when Supabase env is absent.
 */
async function seedAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.log("• Skipping admin seed (set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to enable)");
    return;
  }

  const email = process.env.ADMIN_EMAIL ?? "admin@pagebee.com";
  const password = process.env.ADMIN_PASSWORD ?? "pagebee-admin-dev";
  const supabaseAdmin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let supabaseUserId: string | undefined;
  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created?.user) {
    supabaseUserId = created.user.id;
  } else {
    // Likely already exists — find it.
    if (error) console.log(`• createUser: ${error.message} — looking up existing user`);
    const { data: list } = await supabaseAdmin.auth.admin.listUsers();
    supabaseUserId = list?.users.find((u) => u.email === email)?.id;
  }

  const role = await prisma.role.upsert({
    where: { name: "ADMIN" },
    update: {},
    create: { name: "ADMIN", description: "Platform administrator" },
  });

  const user = await prisma.user.upsert({
    where: { email },
    update: { supabaseUserId, type: "PLATFORM", status: "ACTIVE" },
    create: { email, name: "Platform Admin", type: "PLATFORM", status: "ACTIVE", supabaseUserId },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id },
  });

  console.log(`✔ Seeded admin user ${email} (role ADMIN)`);
}

async function main() {
  // 1. Plans (canonical pricing + feature flags).
  for (const plan of PLANS) {
    const data = {
      setupFee: plan.setupFee,
      monthlyFee: plan.monthlyFee,
      maxPages: plan.maxPages,
      monthlyUpdates: plan.monthlyUpdates,
      featureFlags: plan.featureFlags as Prisma.InputJsonValue,
    };
    await prisma.plan.upsert({
      where: { name: plan.name },
      update: data,
      create: { name: plan.name, ...data },
    });
  }
  console.log(`✔ Seeded ${PLANS.length} plans`);

  // 2. Demo tenant.
  const client = await prisma.client.upsert({
    where: { slug: "demo-cleaning" },
    update: {},
    create: {
      slug: "demo-cleaning",
      businessName: "Sparkle Demo Cleaning Co.",
      businessType: "Cleaning service",
      ownerName: "Dana Demo",
      ownerEmail: "owner@pagebee.com",
    },
  });

  // 3. Active Automate subscription for the demo tenant.
  const automate = await prisma.plan.findUnique({ where: { name: "AUTOMATE" } });
  if (automate) {
    await prisma.subscription.upsert({
      where: { clientId: client.id },
      update: {},
      create: {
        clientId: client.id,
        planId: automate.id,
        status: "ACTIVE",
        agreedSetupFee: automate.setupFee,
        agreedMonthlyFee: automate.monthlyFee,
        setupFeePaid: true,
      },
    });
  }

  // 4. Demo website with the public site token used by the marketing contact form.
  await prisma.website.upsert({
    where: { siteToken: DEMO_SITE_TOKEN },
    update: {},
    create: {
      clientId: client.id,
      siteToken: DEMO_SITE_TOKEN,
      subdomain: "demo",
      status: "published",
    },
  });

  console.log(`✔ Seeded demo client "${client.businessName}" + website (token: ${DEMO_SITE_TOKEN})`);

  // 5. Platform admin (Supabase Auth + RBAC).
  await seedAdmin();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
