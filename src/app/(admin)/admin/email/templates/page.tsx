import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAuthContext } from "@/lib/auth/session";
import { listTemplates } from "@/lib/modules/email";
import { TemplateManager, type TemplateRow } from "@/components/admin/email/TemplateManager";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const ctx = await getAuthContext();
  if (!ctx?.isAdmin) redirect("/admin/websites");

  const templates = await listTemplates();
  const rows: TemplateRow[] = templates.map((t) => ({ id: t.id, name: t.name, subject: t.subject, bodyHtml: t.bodyHtml, category: t.category }));

  return (
    <div>
      <Link href="/admin/email" className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800">
        <ArrowLeft size={15} /> Email
      </Link>
      <h1 className="mt-2 font-display text-3xl text-stone-900">Templates</h1>
      <p className="mt-1 text-sm text-stone-500">Reusable email content you can drop into a campaign.</p>
      <div className="mt-6">
        <TemplateManager initial={rows} />
      </div>
    </div>
  );
}
