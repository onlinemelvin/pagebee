import { getClientWorkspace } from "@/lib/modules/client";
import { listLeads } from "@/lib/modules/lead";
import { prisma } from "@/lib/db";
import { ClientInquiries, type InquiryRow } from "@/components/client/ClientInquiries";
import { UpgradeGate } from "@/components/client/UpgradeGate";

export const dynamic = "force-dynamic";

export default async function ClientInquiriesPage() {
  // Reuse the workspace the layout already resolved (React cache()) — no extra tenant lookup.
  const ws = await getClientWorkspace();
  if (!ws) return null;
  // Lead capture (and this inbox) is a Connect+ feature; the nav shows it to every tier as an upsell.
  if (!ws.caps.forms) return <UpgradeGate title="Inquiries" flag="contactForm" blurb="Capture leads from your website and manage every inquiry in one inbox — available on the CONNECT plan and up." />;

  const [leads, website] = await Promise.all([
    listLeads({ clientId: ws.client.id }),
    prisma.website.findFirst({ where: { clientId: ws.client.id }, select: { leadFormGoal: true } }),
  ]);
  const inquiries: InquiryRow[] = leads.map((l) => ({
    id: l.id,
    name: l.name,
    email: l.email,
    phone: l.phone,
    message: l.message,
    type: l.type,
    status: l.status,
    createdAt: l.createdAt.toISOString(),
  }));

  // The lead-capture master switch shares the `contactForm` flag with the Website page's feature card.
  const formsEnabled = ws.features.find((f) => f.key === "forms")?.state === "enabled";

  return (
    <div>
      <h1 className="font-display text-3xl text-stone-900">Inquiries</h1>
      <p className="mt-1 text-stone-500">Messages from your website. Reply by email or update their status.</p>
      <ClientInquiries inquiries={inquiries} goal={website?.leadFormGoal ?? null} formsEnabled={formsEnabled} />
    </div>
  );
}
