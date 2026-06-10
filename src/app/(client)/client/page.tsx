import Link from "next/link";
import { getClientWorkspace } from "@/lib/modules/client";
import { SetupWizard } from "@/components/client/SetupWizard";
import { PreviewPanel } from "@/components/client/PreviewPanel";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ClientHomePage() {
  const ws = await getClientWorkspace();
  if (!ws) return null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl text-stone-900">
          Welcome, {ws.client.ownerName ?? ws.client.businessName}
        </h1>
        <p className="mt-1 text-stone-500">Here&apos;s what&apos;s happening with your business.</p>
        {ws.client.isTest && (
          <span className="mt-3 inline-block rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-800">
            Test account
          </span>
        )}
      </div>

      {!ws.onboarding.complete && <SetupWizard steps={ws.onboarding.steps} />}

      <PreviewPanel preview={ws.preview} />

      {ws.actions.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-400">Needs your attention</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {ws.actions.map((a, i) => (
              <Link
                key={i}
                href={a.href}
                className={cn(
                  "rounded-2xl border p-5 transition-shadow hover:shadow-sm",
                  a.primary ? "border-amber-400 bg-amber-50" : "border-stone-200 bg-white",
                )}
              >
                <p className="font-medium text-stone-900">{a.title}</p>
                <p className="mt-1 text-sm text-stone-600">{a.desc}</p>
                <span className="mt-3 inline-block text-sm font-semibold text-amber-700">{a.cta} →</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-400">At a glance</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <Stat label="New inquiries" value={String(ws.counts.newInquiries)} href="/client/inquiries" />
          {ws.caps.booking && ws.choices.booking && (
            <Stat label="Pending appointments" value={String(ws.counts.pendingAppointments)} href="/client/appointments" />
          )}
          <Stat
            label="Website"
            value={ws.preview.live ? "Live" : ws.preview.ready ? "Preview ready" : ws.website.exists ? "In progress" : "Not started"}
            href="/client/website"
          />
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <Link href={href} className="rounded-2xl border border-stone-200 bg-white p-5 transition-shadow hover:shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">{label}</p>
      <p className="mt-2 font-display text-3xl text-stone-900">{value}</p>
    </Link>
  );
}
