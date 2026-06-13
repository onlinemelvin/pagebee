import { notFound } from "next/navigation";
import { getPublicDocument } from "@/lib/modules/finance";
import { PublicDocumentView } from "@/components/client/finance/PublicDocumentView";

export const dynamic = "force-dynamic";

export default async function PublicDocumentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const doc = await getPublicDocument(token);
  if (!doc) notFound();
  return <PublicDocumentView doc={doc} businessName={doc.businessName} paymentsEnabled={doc.paymentsEnabled} />;
}
