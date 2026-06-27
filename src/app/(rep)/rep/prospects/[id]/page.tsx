import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { getRepWorkspace, getProspect, listQuotes, SalesError } from "@/lib/modules/sales";
import { ProspectDetail, type ProspectDetailData, type TimelineItem } from "@/components/rep/ProspectDetail";
import { QuotesPanel, type QuoteRow, type PlanPricing } from "@/components/rep/QuotesPanel";

async function planPricing(): Promise<PlanPricing> {
  const plans = await prisma.plan.findMany({ select: { name: true, setupFee: true, monthlyFee: true } });
  const fallback = { NECTAR: { setup: 39900, monthly: 3900 }, HONEY: { setup: 69900, monthly: 8900 }, HIVE: { setup: 99900, monthly: 17900 } };
  for (const p of plans) {
    if (p.name in fallback) fallback[p.name as keyof PlanPricing] = { setup: p.setupFee, monthly: p.monthlyFee };
  }
  return fallback;
}

export const dynamic = "force-dynamic";

export default async function RepProspectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ws = await getRepWorkspace();
  if (!ws) return null;
  const { id } = await params;

  let prospect;
  try {
    prospect = await getProspect(ws.employee.id, id);
  } catch (err) {
    if (err instanceof SalesError) notFound();
    throw err;
  }
  if (!prospect) notFound();

  const activities = (prospect.activities ?? []) as Array<{ id: string; type: string; summary: string; createdAt: Date }>;
  const callNotes = (prospect.callNotes ?? []) as Array<{ id: string; outcome: string | null; note: string; createdAt: Date }>;

  const timeline: TimelineItem[] = [
    ...activities.map((a) => ({
      id: `a-${a.id}`,
      kind: "activity" as const,
      label: a.type,
      detail: a.summary,
      createdAt: a.createdAt.toISOString(),
    })),
    ...callNotes.map((c) => ({
      id: `c-${c.id}`,
      kind: "call" as const,
      label: `Call · ${c.outcome ?? "logged"}`,
      detail: c.note,
      createdAt: c.createdAt.toISOString(),
    })),
  ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const data: ProspectDetailData = {
    id: prospect.id,
    businessName: prospect.businessName,
    contactName: prospect.contactName,
    email: prospect.email,
    phone: prospect.phone,
    status: prospect.status,
    notes: prospect.notes,
    timeline,
  };

  const [quotes, pricing] = await Promise.all([listQuotes(ws.employee.id, { prospectId: id }), planPricing()]);
  const quoteRows: QuoteRow[] = quotes.map((q) => ({
    id: q.id,
    status: q.status,
    plan: q.plan,
    offeredSetupFee: q.offeredSetupFee,
    offeredMonthlyFee: q.offeredMonthlyFee,
    requiresApproval: q.requiresApproval,
  }));

  return (
    <div className="space-y-5">
      <Link href="/rep/prospects" className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800">
        <ArrowLeft size={15} /> Back to prospects
      </Link>
      <ProspectDetail data={data} />
      <QuotesPanel
        prospectId={id}
        quotes={quoteRows}
        pricing={pricing}
        canQuote={ws.hasActiveContract && ws.certified}
      />
    </div>
  );
}
