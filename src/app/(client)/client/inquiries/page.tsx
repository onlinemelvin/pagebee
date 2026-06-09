import { getCurrentClient } from "@/lib/auth/session";
import { listLeads } from "@/lib/modules/lead";
import { ClientInquiries, type InquiryRow } from "@/components/client/ClientInquiries";

export const dynamic = "force-dynamic";

export default async function ClientInquiriesPage() {
  const result = await getCurrentClient();
  if (!result) return null;

  const leads = await listLeads({ clientId: result.client.id });
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

  return (
    <div>
      <h1 className="font-display text-3xl text-stone-900">Inquiries</h1>
      <p className="mt-1 text-stone-500">Messages from your website. Reply by email or update their status.</p>
      <ClientInquiries inquiries={inquiries} />
    </div>
  );
}
