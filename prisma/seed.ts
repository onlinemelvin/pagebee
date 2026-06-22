import { PrismaClient, type Prisma } from "@prisma/client";
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

  // Call the GoTrue admin REST API directly (avoids supabase-js, which pulls in a
  // realtime WebSocket client that Node < 22 can't construct).
  const authHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };

  let supabaseUserId: string | undefined;
  const createRes = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (createRes.ok) {
    const user = (await createRes.json()) as { id: string };
    supabaseUserId = user.id;
  } else {
    console.log(`• createUser returned ${createRes.status} — looking up existing user`);
    const listRes = await fetch(`${url}/auth/v1/admin/users?per_page=200`, { headers: authHeaders });
    if (listRes.ok) {
      const data = (await listRes.json()) as { users?: Array<{ id: string; email?: string }> };
      supabaseUserId = data.users?.find((u) => u.email === email)?.id;
    }
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

/**
 * RBAC: permissions + roles. `website:review` gates the review queue/annotations and
 * `website:publish` the go-live action. ADMIN gets both; a REVIEWER role gets review
 * only — so a future contractor is onboarded by assigning REVIEWER, no code change.
 */
async function seedRbac() {
  const perms = [
    { key: "website:review", description: "Review generated websites and leave annotations" },
    { key: "website:publish", description: "Approve and publish a generated website" },
  ];
  const permRows = await Promise.all(
    perms.map((p) =>
      prisma.permission.upsert({ where: { key: p.key }, update: { description: p.description }, create: p }),
    ),
  );
  const byKey = Object.fromEntries(permRows.map((p) => [p.key, p.id]));

  const admin = await prisma.role.upsert({
    where: { name: "ADMIN" },
    update: {},
    create: { name: "ADMIN", description: "Platform administrator" },
  });
  const reviewer = await prisma.role.upsert({
    where: { name: "REVIEWER" },
    update: {},
    create: { name: "REVIEWER", description: "Website reviewer / contractor" },
  });

  const grants: Array<{ roleId: string; permissionId: string }> = [
    { roleId: admin.id, permissionId: byKey["website:review"] },
    { roleId: admin.id, permissionId: byKey["website:publish"] },
    { roleId: reviewer.id, permissionId: byKey["website:review"] },
  ];
  for (const g of grants) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: g.roleId, permissionId: g.permissionId } },
      update: {},
      create: g,
    });
  }
  console.log("✔ Seeded RBAC (permissions: website:review, website:publish; roles: ADMIN, REVIEWER)");
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
  const automate = await prisma.plan.findUnique({ where: { name: "HIVE" } });
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

  // 5. RBAC (permissions + roles) then the platform admin (Supabase Auth).
  await seedRbac();
  await seedAdmin();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
