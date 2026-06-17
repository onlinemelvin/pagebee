import { notFound, redirect } from "next/navigation";
import { getClientWorkspace } from "@/lib/modules/client";
import { getDocument, FinanceError } from "@/lib/modules/finance";
import { DocumentView } from "@/components/client/finance/DocumentView";

export const dynamic = "force-dynamic";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const ws = await getClientWorkspace();
  if (!ws) return null;
  if (!ws.caps.invoices) redirect("/client/invoices"); // off-plan → finance index shows the upgrade gate

  const { id } = await params;
  try {
    const doc = await getDocument(ws.client.id, id);
    return (
      <div>
        <DocumentView doc={doc} appUrl={APP_URL} />
      </div>
    );
  } catch (err) {
    if (err instanceof FinanceError) notFound();
    throw err;
  }
}
