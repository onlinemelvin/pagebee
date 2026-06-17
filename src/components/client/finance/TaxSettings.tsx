"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Calculator, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TaxStatus } from "@/lib/modules/payments";

const US_STATES = "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" ");

export function TaxSettings({ status }: { status: TaxStatus }) {
  const router = useRouter();
  const [mode, setMode] = React.useState<"manual" | "automatic">(status.mode);
  const [states, setStates] = React.useState<string[]>(status.registeredStates);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);

  if (!status.configured) return null;

  function toggleState(s: string) {
    setStates((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v1/client/payments/tax", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "automatic" ? { mode, states } : { mode }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
      if (!res.ok) throw new Error(data?.message ?? data?.error ?? "Couldn't save");
      setMsg({ kind: "ok", text: "Tax settings saved." });
      router.refresh();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Couldn't save tax settings." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-card">
      <div className="flex items-center gap-2">
        <Calculator size={18} className="text-stone-500" />
        <h2 className="font-display text-lg text-stone-900">Sales tax</h2>
        {mode === "automatic" && status.active && (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700"><Check size={11} /> Automatic</span>
        )}
      </div>

      <div className="mt-3 inline-flex rounded-lg border border-stone-200 p-0.5 text-sm">
        {(["manual", "automatic"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn("rounded-md px-3 py-1 font-medium capitalize", mode === m ? "bg-stone-900 text-white" : "text-stone-500 hover:text-stone-800")}
          >
            {m === "manual" ? "Manual rates" : "Automatic (Stripe Tax)"}
          </button>
        ))}
      </div>

      {mode === "manual" ? (
        <p className="mt-3 text-sm text-stone-500">You pick a tax rate per line from the rates below. Nothing else to set up.</p>
      ) : !status.available ? (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>Activate <strong>PageBee Pay</strong> first — automatic tax runs on your connected payments account.</span>
        </div>
      ) : (
        <div className="mt-3">
          <p className="text-sm text-stone-600">
            We&apos;ll calculate the exact tax on every invoice from the customer&apos;s address. Pick the states where you&apos;re <strong>registered to collect</strong> sales tax — tax is only charged where you select.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {US_STATES.map((s) => (
              <button
                key={s}
                onClick={() => toggleState(s)}
                className={cn(
                  "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                  states.includes(s) ? "border-amber-400 bg-amber-100 text-amber-800" : "border-stone-200 text-stone-500 hover:bg-stone-100",
                )}
              >
                {s}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-stone-400">Stripe Tax bills ~0.5% per taxed transaction. Only jurisdictions you select here are charged.</p>
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <Button size="sm" disabled={busy || (mode === "automatic" && !status.available)} onClick={save}>
          {busy ? "Saving…" : "Save tax settings"}
        </Button>
        {msg && <span className={cn("text-sm font-medium", msg.kind === "ok" ? "text-green-700" : "text-red-600")}>{msg.text}</span>}
      </div>
    </section>
  );
}
