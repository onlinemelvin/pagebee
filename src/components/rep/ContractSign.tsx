"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, CheckCircle2 } from "lucide-react";
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
      router.refresh();
      router.push("/rep");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {active ? (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
          <CheckCircle2 size={18} />
          <span>
            Signed and active{contract?.signedAt ? ` on ${new Date(contract.signedAt).toLocaleDateString()}` : ""}. You&apos;re
            cleared to sell.
          </span>
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
        <div className="mt-3 max-h-72 space-y-3 overflow-y-auto rounded-xl bg-stone-50 p-4 text-xs leading-relaxed text-stone-600">
          <p><strong>1. Independent contractor.</strong> You are an independent contractor, not an employee. You control your own hours, methods, and equipment, and are responsible for your own taxes.</p>
          <p><strong>2. No authority to bind.</strong> You may not set pricing, make promises, or create obligations on PageBee&apos;s behalf beyond the approved discount floors above.</p>
          <p><strong>3. Commission &amp; clawback.</strong> As summarized above; computed on collected revenue and subject to the {terms.clawbackDays}-day clawback.</p>
          <p><strong>4. Conduct &amp; compliance.</strong> Accurate statements only; comply with TCPA/CAN-SPAM/Do-Not-Call; no unlawful call recording; no fake or self-dealing sign-ups.</p>
          <p><strong>5. Confidentiality &amp; data.</strong> Prospect and client data belong to PageBee; no exporting or keeping lists; access ends on termination.</p>
          <p><strong>6. Term.</strong> Either party may end the engagement on notice; earned commissions past the clawback window remain payable.</p>
          <p className="text-stone-400">This is a summary for signing in-app. The full agreement governs and is available from your manager.</p>
        </div>
      </section>

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
  return (
    <tr>
      <td className="px-4 py-2 font-medium text-stone-800">{plan}</td>
      <td className="px-4 py-2 text-stone-600">${listed}</td>
      <td className="px-4 py-2 text-stone-600">${floor}</td>
      <td className="px-4 py-2 font-semibold text-emerald-700">${base}</td>
    </tr>
  );
}
