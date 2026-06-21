import Link from "next/link";
import { redirect } from "next/navigation";
import { Mail, Send, MailOpen, AlertTriangle, Megaphone, FileText } from "lucide-react";
import { getAuthContext } from "@/lib/auth/session";
import { emailOverview, emailByCategory, listEmailLogs } from "@/lib/modules/email";
import { CATEGORY_LABELS } from "@/lib/modules/email";
import { StatCard } from "@/components/client/ui/StatCard";
import { EmailLogsTable, type EmailLogRow } from "@/components/admin/email/EmailLogsTable";

export const dynamic = "force-dynamic";

export default async function AdminEmailPage() {
  const ctx = await getAuthContext();
  if (!ctx?.isAdmin) redirect("/admin/websites");

  const [overview, byCategory, logs] = await Promise.all([
    emailOverview(30),
    emailByCategory(30),
    listEmailLogs({ take: 25 }),
  ]);

  const rows: EmailLogRow[] = logs.rows.map((l) => ({
    id: l.id,
    toEmail: l.toEmail,
    subject: l.subject,
    category: l.category,
    status: l.status,
    template: l.template,
    openCount: l.openCount,
    createdAt: l.createdAt.toISOString(),
  }));

  const maxCat = Math.max(1, ...byCategory.map((c) => c.sent));

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-stone-900">Email</h1>
          <p className="mt-1 text-sm text-stone-500">Everything PageBee sends to clients — delivery, opens, and bulk campaigns. Last 30 days.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/email/templates" className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-100">
            <FileText size={15} /> Templates
          </Link>
          <Link href="/admin/email/campaigns" className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-stone-900 hover:bg-amber-400">
            <Megaphone size={15} /> Campaigns
          </Link>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard index={0} icon={Send} accent="sky" label="Sent" value={overview.sent} />
        <StatCard index={1} icon={Mail} accent="emerald" label={`Delivered · ${overview.deliveryRate}%`} value={overview.delivered} />
        <StatCard index={2} icon={MailOpen} accent="violet" label={`Opened · ${overview.openRate}%`} value={overview.opened} />
        <StatCard index={3} icon={AlertTriangle} accent="rose" label={`Bounced · ${overview.bounceRate}%`} value={overview.bounced} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.6fr]">
        {/* By category */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-card">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">By category</h2>
          {byCategory.length === 0 ? (
            <p className="mt-3 text-sm text-stone-400">No emails sent yet.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {byCategory.map((c) => (
                <li key={c.category}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-stone-600">{CATEGORY_LABELS[c.category]}</span>
                    <span className="text-stone-400">{c.sent} sent · {c.opened} opened</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-100">
                    <div className="h-full bg-amber-400" style={{ width: `${(c.sent / maxCat) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Headline note */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-card">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Health</h2>
          <div className="mt-4 grid grid-cols-3 gap-4">
            <div className="rounded-xl bg-stone-50 p-3">
              <p className="font-display text-2xl text-stone-900">{overview.deliveryRate}%</p>
              <p className="mt-0.5 text-xs text-stone-500">Delivery rate</p>
            </div>
            <div className="rounded-xl bg-stone-50 p-3">
              <p className="font-display text-2xl text-stone-900">{overview.openRate}%</p>
              <p className="mt-0.5 text-xs text-stone-500">Open rate</p>
            </div>
            <div className="rounded-xl bg-stone-50 p-3">
              <p className="font-display text-2xl text-stone-900">{overview.failed}</p>
              <p className="mt-0.5 text-xs text-stone-500">Failed sends</p>
            </div>
          </div>
          <p className="mt-4 text-xs text-stone-400">
            Open and delivery rates populate as Resend webhook events arrive. Configure the webhook at <code>/api/v1/webhooks/resend</code> and set <code>RESEND_WEBHOOK_SECRET</code>.
          </p>
        </div>
      </div>

      <div className="mt-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">Recent emails</h2>
        <EmailLogsTable initial={rows} initialCursor={logs.nextCursor} />
      </div>
    </div>
  );
}
