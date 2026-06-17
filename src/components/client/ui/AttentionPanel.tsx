import Link from "next/link";
import { CheckCircle2, ArrowRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type AttentionTone = "amber" | "teal" | "violet" | "red" | "sky";

export interface AttentionItem {
  key: string;
  icon: LucideIcon;
  tone: AttentionTone;
  text: string;
  href: string;
  cta: string;
}

const TONE: Record<AttentionTone, { chip: string; cta: string }> = {
  amber: { chip: "bg-amber-100 text-amber-700", cta: "text-amber-700 hover:text-amber-800" },
  teal: { chip: "bg-teal-100 text-teal-700", cta: "text-teal-700 hover:text-teal-800" },
  violet: { chip: "bg-violet-100 text-violet-700", cta: "text-violet-700 hover:text-violet-800" },
  red: { chip: "bg-red-100 text-red-700", cta: "text-red-700 hover:text-red-800" },
  sky: { chip: "bg-sky-100 text-sky-700", cta: "text-sky-700 hover:text-sky-800" },
};

/**
 * The Overview "do this now" panel — surfaces the handful of time-sensitive things an owner should act
 * on (open inquiries, appointments soon / to confirm, overdue invoices, quotes awaiting a reply, work
 * to invoice). Each row is one tap to the right place. Shows a calm "all caught up" state when empty.
 */
export function AttentionPanel({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-5 py-4 shadow-card">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-green-100 text-green-600"><CheckCircle2 size={20} /></span>
        <div>
          <p className="font-medium text-stone-900">You&apos;re all caught up</p>
          <p className="text-sm text-stone-500">No inquiries, appointments, or invoices need your attention right now.</p>
        </div>
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-card">
      <div className="flex items-center justify-between border-b border-stone-100 px-5 py-3">
        <h2 className="flex items-center gap-2 font-semibold text-stone-900">
          Needs your attention
          <span className="rounded-full bg-stone-900 px-2 py-0.5 text-xs font-bold text-white">{items.length}</span>
        </h2>
      </div>
      <ul className="divide-y divide-stone-100">
        {items.map((it) => {
          const Icon = it.icon;
          const tone = TONE[it.tone];
          return (
            <li key={it.key}>
              <Link href={it.href} className="group flex items-center gap-3 px-5 py-3.5 transition hover:bg-stone-50">
                <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", tone.chip)}><Icon size={18} /></span>
                <span className="min-w-0 flex-1 text-sm font-medium text-stone-800">{it.text}</span>
                <span className={cn("inline-flex shrink-0 items-center gap-1 text-sm font-semibold", tone.cta)}>
                  {it.cta} <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
