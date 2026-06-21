import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAuthContext } from "@/lib/auth/session";
import { listTemplates } from "@/lib/modules/email";
import { CampaignComposer, type TemplateOption } from "@/components/admin/email/CampaignComposer";

export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  const ctx = await getAuthContext();
  if (!ctx?.isAdmin) redirect("/admin/websites");

  const templates = await listTemplates();
  const options: TemplateOption[] = templates.map((t) => ({ id: t.id, name: t.name, subject: t.subject, bodyHtml: t.bodyHtml }));

  return (
    <div>
      <Link href="/admin/email/campaigns" className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800">
        <ArrowLeft size={15} /> Campaigns
      </Link>
      <h1 className="mt-2 font-display text-3xl text-stone-900">New campaign</h1>
      <p className="mt-1 text-sm text-stone-500">Compose a bulk email, choose an audience, and send now or schedule it.</p>
      <div className="mt-6">
        <CampaignComposer templates={options} />
      </div>
    </div>
  );
}
