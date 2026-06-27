import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getClientWorkspace } from "@/lib/modules/client";
import { getKnowledge } from "@/lib/modules/knowledge";
import { KnowledgeEditor } from "@/components/client/KnowledgeEditor";

export const dynamic = "force-dynamic";

export default async function KnowledgeBasePage() {
  const ws = await getClientWorkspace();
  if (!ws) return null;
  if (!ws.access.website.view) redirect("/client"); // staff without website access

  const { data, documents } = await getKnowledge(ws.client.id);

  return (
    <div>
      <Link href="/client/website" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-stone-500 hover:text-stone-800">
        <ArrowLeft size={15} /> Website
      </Link>
      <h1 className="font-display text-3xl text-stone-900">AI knowledge base</h1>
      <p className="mt-1 text-stone-500">Teach your AI about your business — it powers your website copy and your chat assistant&apos;s answers.</p>
      <KnowledgeEditor initialData={data} initialDocs={documents} canEdit={ws.access.website.manage} />
    </div>
  );
}
