"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, CheckCircle2, BookOpen, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

export interface ContractTermsView {
  planName: string;
  bases: { nectar: number; honey: number; hive: number };
  floors: { NECTAR: number; HONEY: number; HIVE: number };
  listedSetup: { NECTAR: number; HONEY: number; HIVE: number };
  clawbackDays: number;
  recurringPct: number;
  recurringMonths: number;
}

export interface ContractView {
  id: string;
  status: string;
  title: string;
  signedAt: string | null;
  commissionTerms: string | null;
  documentUrl: string | null;
}

const ERROR_COPY: Record<string, string> = {
  already_signed: "This agreement is already active.",
  contract_not_found: "No agreement was found for your account. Contact your manager.",
  contract_not_signable: "This agreement can no longer be signed. Contact your manager.",
  validation_error: "Type your full legal name and accept the agreement.",
};

export function ContractSign({ contract, terms }: { contract: ContractView | null; terms: ContractTermsView }) {
  const router = useRouter();
  const [fullName, setFullName] = React.useState("");
  const [agree, setAgree] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const active = contract?.status === "ACTIVE" || contract?.status === "SIGNED";

  async function sign(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/rep/contract/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, agree }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(ERROR_COPY[data.error ?? ""] ?? "Could not sign. Please try again.");
        return;
      }
      toast.success("Agreement signed — you're cleared to sell 🐝");
      // Navigate first, then refresh so the destination's server components (incl. the layout's
      // "sign your agreement" banner, now that the contract is ACTIVE) re-render with fresh data.
      router.push("/rep");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {active ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
          <span className="flex items-center gap-2">
            <CheckCircle2 size={18} />
            Signed and active{contract?.signedAt ? ` on ${new Date(contract.signedAt).toLocaleDateString()}` : ""}. You&apos;re
            cleared to sell.
          </span>
          {contract?.documentUrl ? (
            <a
              href={contract.documentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 transition-colors hover:bg-emerald-100"
            >
              <Download size={14} /> Download PDF
            </a>
          ) : null}
        </div>
      ) : null}

      {/* Commission terms */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-stone-700">Commission terms — {terms.planName}</h2>
        <div className="mt-4 overflow-hidden rounded-xl border border-stone-100">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-400">
              <tr>
                <th className="px-4 py-2 font-medium">Plan</th>
                <th className="px-4 py-2 font-medium">Listed setup</th>
                <th className="px-4 py-2 font-medium">Your floor</th>
                <th className="px-4 py-2 font-medium">Max off (no approval)</th>
                <th className="px-4 py-2 font-medium">Commission / client</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              <Row plan="Nectar" listed={terms.listedSetup.NECTAR} floor={terms.floors.NECTAR} base={terms.bases.nectar} />
              <Row plan="Honey" listed={terms.listedSetup.HONEY} floor={terms.floors.HONEY} base={terms.bases.honey} />
              <Row plan="Hive" listed={terms.listedSetup.HIVE} floor={terms.floors.HIVE} base={terms.bases.hive} />
            </tbody>
          </table>
        </div>
        <ul className="mt-4 space-y-1.5 text-xs text-stone-500">
          <li>• Commission is earned on a converted client (setup paid + first month cleared + {terms.clawbackDays}-day clawback passed).</li>
          <li>• Setup-fee discounts beyond $50 reduce commission proportionally (floor: 50% of base). Monthly discounts need admin approval.</li>
          <li>• Independent contractor; commission-only. Paid via the hiring platform after clearance.</li>
          {terms.recurringPct > 0 ? (
            <li>• Recurring: {terms.recurringPct}% of collected monthly fees for {terms.recurringMonths} months.</li>
          ) : null}
        </ul>
      </section>

      {/* Agreement body */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-stone-700">{contract?.title ?? "Sales-Rep Commission Agreement"}</h2>
        <p className="mt-1 text-xs text-stone-400">Please read in full. Signing means you understood and agreed to all of the below.</p>
        <div className="mt-3 max-h-96 space-y-3 overflow-y-auto rounded-xl bg-stone-50 p-4 text-xs leading-relaxed text-stone-600">
          <p><strong>1. Independent contractor.</strong> You are an independent contractor, not an employee. You control your own hours, methods, and equipment, you supply your own gear, you may work for others (subject to §7–§8), and you are solely responsible for your own taxes.</p>

          <p><strong>2. Your role &amp; the funnel.</strong> You find local-business prospects, show them the free AI website preview, answer questions accurately, optionally offer an approved discount, and help them create an account and pay. You log every prospect, call, note, and follow-up in this portal. The funnel: <em>Prospect added → Contacted → Preview sent → Quote sent → Account created → Setup paid → Converted.</em></p>

          <p><strong>3. Attribution (first touch).</strong> When you add a prospect, the system locks it to you. If that prospect becomes a paying client, the commission is yours as the &quot;rep of record.&quot; If a prospect already belongs to another rep, re-adding them does not move them to you. PageBee&apos;s records settle any dispute.</p>

          <p><strong>4. No authority to bind.</strong> You may not set pricing, waive fees, make promises, or create obligations on PageBee&apos;s behalf beyond the approved discount floors above.</p>

          <p><strong>5. When you earn a commission (&quot;conversion&quot;).</strong> You earn the per-client commission shown above only when <em>all three</em> are true: (a) the setup fee is collected, (b) the first monthly payment has cleared, and (c) the {terms.clawbackDays}-day clawback window has passed with no cancel, refund, or chargeback. Until then it is only <em>pending</em>. Unconverted prospects, previews, quotes, and demos earn nothing.</p>

          <p><strong>6. How the amount is computed.</strong> Commission is a flat amount per converted client by plan (table above), computed on revenue actually collected. The first <strong>$50</strong> off the setup fee doesn&apos;t affect your commission. Discounts <em>deeper</em> than $50 reduce your commission by the same percentage as the setup-fee discount, floored at 50% of the base. You can discount to win a deal, but you can&apos;t buy it entirely out of our margin.</p>

          <p><strong>7. Discounts you can apply.</strong> On your own, you may discount the <em>setup fee only</em>, down to your floor (above) — no monthly-fee discount. Anything deeper needs admin approval through the quote-approval workflow: any monthly-fee discount, any setup below the floor, a waived setup fee, or more than one discount on a quote. No self-approving or splitting discounts to get around this.</p>

          <p><strong>8. Clawback.</strong> If a new client cancels, is refunded, charges back, or fails the first monthly payment <em>within {terms.clawbackDays} days</em> of the setup payment: if you haven&apos;t been paid yet, the commission is not earned; if you have, it&apos;s reversed and offset against future payouts (or repaid within 30 days). Partial refunds reduce the commission proportionally. After the window passes in good standing, that commission is locked in.</p>

          <p><strong>9. When you get paid.</strong> Commissions move Pending → Eligible (first month cleared + clawback passed) → Paid. Eligible commissions are paid on a recurring payout cadence — a commission earned mid-period is paid in the <em>next</em> scheduled run, not the moment it converts. You get a statement each period showing pending, eligible, paid, and clawed-back by client. Any transfer/platform/FX fees are yours.</p>
          {terms.recurringPct > 0 ? (
            <p><strong>9a. Recurring tail.</strong> You also earn {terms.recurringPct}% of collected monthly fees for {terms.recurringMonths} months per client; it stops when the client cancels.</p>
          ) : null}

          <p><strong>10. Conduct &amp; compliance.</strong> Accurate statements only — no guarantees, invented features, or unauthorized promises. Comply with TCPA/CAN-SPAM/Do-Not-Call and calling-hour rules; no unlawful call recording; no spam or purchased lead lists; no fake, self-owned, or collusive sign-ups. Breach can mean immediate termination and forfeiture of related unpaid commissions.</p>

          <p><strong>11. Confidentiality &amp; data.</strong> Prospect and client data, pricing, and materials belong to PageBee and are confidential. No exporting, copying, or keeping lists; access ends on termination.</p>

          <p><strong>12. Term &amp; termination.</strong> Either party may end the engagement on notice; PageBee may end it immediately for breach or suspected fraud. Commissions already earned past the clawback window remain payable; pending/unconverted items earn nothing.</p>

          <p className="text-stone-400">This in-app agreement governs your engagement. The full PDF version with the complete legal terms is stored on your account and available from your manager.</p>
        </div>
      </section>

      {/* Where to find information */}
      <a
        href="/rep/resources"
        className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 transition-colors hover:bg-amber-100/70"
      >
        <BookOpen size={18} className="mt-0.5 shrink-0 text-amber-600" />
        <span className="text-sm text-amber-900">
          <span className="font-semibold">Where to find information.</span> Everything about how PageBee works — plan &amp;
          pricing sheet, the discount floors, how the free preview works, the full feature set, demo scripts, and
          how-tos — lives in your <span className="font-semibold underline">Resources</span> hub. That&apos;s your source of
          truth; if something isn&apos;t there, ask your manager.
        </span>
      </a>

      {/* Sign */}
      {!active ? (
        <form onSubmit={sign} className="rounded-2xl border border-stone-200 bg-white p-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-stone-700">
            <ShieldCheck size={16} className="text-emerald-500" /> Electronic signature
          </h2>
          <label className="mt-4 block">
            <span className="mb-1 block text-xs font-medium text-stone-500">Type your full legal name</span>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Q. Rep" required />
          </label>
          <label className="mt-4 flex items-start gap-2 text-sm text-stone-600">
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-stone-300 text-amber-500 focus:ring-amber-400"
            />
            <span>I have read and agree to the Sales-Rep Commission Agreement, and I&apos;m signing it electronically.</span>
          </label>
          {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
          <div className="mt-5">
            <Button type="submit" disabled={busy || !fullName.trim() || !agree}>
              {busy ? "Signing…" : "Sign & activate"}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function Row({ plan, listed, floor, base }: { plan: string; listed: number; floor: number; base: number }) {
  const pctOff = listed > 0 ? Math.round(((listed - floor) / listed) * 100) : 0;
  return (
    <tr>
      <td className="px-4 py-2 font-medium text-stone-800">{plan}</td>
      <td className="px-4 py-2 text-stone-600">${listed}</td>
      <td className="px-4 py-2 text-stone-600">${floor}</td>
      <td className="px-4 py-2 text-stone-600">${listed - floor} ({pctOff}%)</td>
      <td className="px-4 py-2 font-semibold text-emerald-700">${base}</td>
    </tr>
  );
}
