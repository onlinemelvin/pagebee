"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import { Sparkles, ArrowRight, ArrowLeft, ShieldCheck, Upload, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { MCC_OPTIONS, type OnboardingState } from "@/lib/modules/payments";
import type { FinanceSettings } from "@/lib/modules/finance";

const COUNTRIES: [string, string][] = [
  ["US", "United States"],
  ["CA", "Canada"],
  ["GB", "United Kingdom"],
  ["AU", "Australia"],
];

const STEPS = ["type", "rep", "business", "bank", "review"] as const;
const STEP_LABELS: Record<(typeof STEPS)[number], string> = {
  type: "Business type",
  rep: "Your details",
  business: "Business info",
  bank: "Payout account",
  review: "Review & activate",
};
type Step = (typeof STEPS)[number];
type Phase = "form" | "submitting" | "document" | "pending";

const US_STATES = "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" ");

const digits = (s: string) => s.replace(/\D/g, "");
const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
/** US routing number: 9 digits passing the ABA checksum. */
function validRouting(r: string): boolean {
  if (!/^\d{9}$/.test(r)) return false;
  const d = r.split("").map(Number);
  return (3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8])) % 10 === 0;
}
function validDob(m: number, d: number, y: number): boolean {
  if (!m || !d || !y) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d && dt < new Date();
}

export function PageBeePayOnboarding({ settings, state: initialState }: { settings: FinanceSettings; state: OnboardingState }) {
  const router = useRouter();
  const pubKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  const p = settings.payoutProfile;

  const [phase, setPhase] = React.useState<Phase>(
    initialState.hasAccount && initialState.needsDocument ? "document" : initialState.hasAccount && initialState.detailsSubmitted ? "pending" : "form",
  );
  const [onb, setOnb] = React.useState<OnboardingState>(initialState);
  const [step, setStep] = React.useState<Step>("type");
  const [error, setError] = React.useState<string | null>(null);

  const [f, setF] = React.useState({
    businessType: p.businessType,
    country: p.country || "US",
    firstName: p.firstName,
    lastName: p.lastName,
    email: settings.businessInfo.email || "",
    phone: settings.businessInfo.phone || "",
    dobDay: p.dobDay ?? ("" as number | ""),
    dobMonth: p.dobMonth ?? ("" as number | ""),
    dobYear: p.dobYear ?? ("" as number | ""),
    ssn: "",
    addressLine1: p.addressLine1,
    addressLine2: p.addressLine2,
    city: p.city,
    state: p.state,
    postalCode: p.postalCode,
    businessName: p.legalName,
    mcc: p.mcc || "",
    productDescription: p.productDescription,
    taxId: "",
  });
  const [bank, setBank] = React.useState({ holderName: "", holderType: "individual" as "individual" | "company", routing: "", account: "" });
  const [tos, setTos] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const set = (patch: Partial<typeof f>) => setF((prev) => ({ ...prev, ...patch }));
  const isCo = f.businessType === "company";
  const stepIdx = STEPS.indexOf(step);

  /** Validate one step; returns a field → message map (empty = valid). */
  function validateStep(s: Step): Record<string, string> {
    const e: Record<string, string> = {};
    if (s === "rep") {
      if (!f.firstName.trim()) e.firstName = "Required";
      if (!f.lastName.trim()) e.lastName = "Required";
      if (!validEmail(f.email)) e.email = "Enter a valid email";
      if (digits(f.phone).length < 10) e.phone = "Enter a valid phone number";
      if (!validDob(Number(f.dobMonth), Number(f.dobDay), Number(f.dobYear))) e.dob = "Enter a valid date of birth";
      else if (new Date().getFullYear() - Number(f.dobYear) < 18) e.dob = "Must be at least 18 years old";
      if (f.ssn.length !== 9) e.ssn = "Enter the full 9-digit SSN";
      if (!f.addressLine1.trim()) e.addressLine1 = "Required";
      if (!f.city.trim()) e.city = "Required";
      if (!f.state) e.state = "Select a state";
      if (!/^\d{5}(-?\d{4})?$/.test(f.postalCode.trim())) e.postalCode = "Enter a valid ZIP code";
    }
    if (s === "business") {
      if (isCo && !f.businessName.trim()) e.businessName = "Required for a company";
      if (isCo && f.taxId.length !== 9) e.taxId = "Enter the 9-digit EIN";
      if (!f.mcc) e.mcc = "Select your industry";
      if (f.productDescription.trim().length < 5) e.productDescription = "Briefly describe what you sell";
    }
    if (s === "bank") {
      if (!validRouting(bank.routing)) e.routing = "Enter a valid 9-digit routing number";
      if (digits(bank.account).length < 4) e.account = "Enter your account number";
    }
    return e;
  }

  function next() {
    const e = validateStep(step);
    if (Object.keys(e).length) {
      setErrors(e);
      setError(null);
      return;
    }
    setErrors({});
    setError(null);
    setStep(STEPS[Math.min(STEPS.length - 1, stepIdx + 1)]);
  }
  function back() {
    setErrors({});
    setError(null);
    setStep(STEPS[Math.max(0, stepIdx - 1)]);
  }

  function applyState(s: OnboardingState) {
    setOnb(s);
    if (s.chargesEnabled) {
      router.push("/client/invoices/settings?connect=done");
      router.refresh();
      return;
    }
    setPhase(s.needsDocument ? "document" : "pending");
  }

  // While verifying (nothing left to collect), poll so the page flips to Active on its own.
  React.useEffect(() => {
    if (phase !== "pending" || onb.currentlyDue.length > 0) return;
    const t = setInterval(async () => {
      const res = await fetch("/api/v1/client/payments/onboarding");
      const data = (await res.json().catch(() => null)) as { state?: OnboardingState } | null;
      if (data?.state) applyState(data.state);
    }, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, onb.currentlyDue.length]);

  async function submit() {
    // Re-check every step so nothing slips through (e.g. edits via Back).
    const all = { ...validateStep("rep"), ...validateStep("business"), ...validateStep("bank") };
    if (Object.keys(all).length) {
      setErrors(all);
      const bad = (["rep", "business", "bank"] as Step[]).find((s) => Object.keys(validateStep(s)).length);
      if (bad) setStep(bad);
      setError("Please fix the highlighted fields before continuing.");
      return;
    }
    if (!tos) {
      setError("Please accept the terms to continue.");
      return;
    }
    if (!pubKey) {
      setError("Payments aren't fully configured yet.");
      return;
    }
    setErrors({});
    setPhase("submitting");
    setError(null);
    try {
      const stripe = await loadStripe(pubKey);
      if (!stripe) throw new Error("Couldn't start secure payment setup.");
      // Tokenize the bank details client-side — PageBee never receives the raw numbers.
      const { token, error: tokErr } = await stripe.createToken("bank_account", {
        country: f.country,
        currency: "usd",
        routing_number: bank.routing,
        account_number: bank.account,
        account_holder_name: bank.holderName || `${f.firstName} ${f.lastName}`,
        account_holder_type: bank.holderType,
      });
      if (tokErr || !token) {
        setError(tokErr?.message ?? "Please check your bank routing and account numbers.");
        setPhase("form");
        setStep("bank");
        return;
      }
      const payload = {
        businessType: f.businessType,
        country: f.country,
        firstName: f.firstName,
        lastName: f.lastName,
        email: f.email,
        phone: f.phone,
        dobDay: Number(f.dobDay),
        dobMonth: Number(f.dobMonth),
        dobYear: Number(f.dobYear),
        ssnLast4: f.ssn.slice(-4),
        idNumber: f.ssn.length === 9 ? f.ssn : undefined,
        addressLine1: f.addressLine1,
        addressLine2: f.addressLine2 || undefined,
        city: f.city,
        state: f.state,
        postalCode: f.postalCode,
        businessName: f.businessName || undefined,
        mcc: f.mcc,
        productDescription: f.productDescription,
        taxId: isCo ? f.taxId : undefined,
        bankToken: token.id,
        accountHolderName: bank.holderName || `${f.firstName} ${f.lastName}`,
        tosAccepted: true as const,
      };
      const res = await fetch("/api/v1/client/payments/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => null)) as { state?: OnboardingState; error?: string; message?: string } | null;
      if (!res.ok || !data?.state) {
        setError(data?.message ?? (data?.error === "validation_error" ? "Please check your details." : "Couldn't complete setup. Please review and try again."));
        setPhase("form");
        setStep("review");
        return;
      }
      applyState(data.state);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setPhase("form");
      setStep("review");
    }
  }

  async function uploadDoc(side: "front" | "back", file: File) {
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("side", side);
    const res = await fetch("/api/v1/client/payments/document", { method: "POST", body: fd });
    const data = (await res.json().catch(() => null)) as { state?: OnboardingState; error?: string } | null;
    if (res.ok && data?.state) applyState(data.state);
    else setError("Couldn't upload that file. Use a clear photo or PDF of your ID.");
  }

  // ── Document-needed state ──
  if (phase === "document") {
    return (
      <div className="mt-6 max-w-xl rounded-2xl border border-stone-200 bg-white p-6 shadow-card">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-100 text-amber-700"><Upload size={18} /></span>
          <h2 className="font-display text-lg text-stone-900">One more thing — verify your ID</h2>
        </div>
        <p className="mt-2 text-sm text-stone-500">For your security, we need a clear photo or PDF of a government ID (driver&apos;s license or passport).</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {(["front", "back"] as const).map((side) => (
            <label key={side} className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed border-stone-300 p-5 text-center text-sm text-stone-500 hover:bg-stone-50">
              <Upload size={18} />
              <span className="font-medium capitalize text-stone-700">{side} of ID</span>
              <span className="text-xs">JPG, PNG, or PDF</span>
              <input type="file" accept="image/jpeg,image/png,application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && uploadDoc(side, e.target.files[0])} />
            </label>
          ))}
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <p className="mt-4 flex items-center gap-1 text-xs text-stone-400"><ShieldCheck size={13} /> Sent securely for verification. PageBee doesn&apos;t store your ID.</p>
      </div>
    );
  }

  // ── Pending / more-info state ──
  if (phase === "pending") {
    return (
      <div className="mt-6 max-w-xl rounded-2xl border border-stone-200 bg-white p-6 shadow-card">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-100 text-amber-700"><Clock size={18} /></span>
          <h2 className="font-display text-lg text-stone-900">{onb.currentlyDue.length ? "A little more needed" : "Verifying your details"}</h2>
        </div>
        {onb.currentlyDue.length ? (
          <>
            <p className="mt-2 text-sm text-stone-500">To finish activating PageBee Pay, we still need:</p>
            <ul className="mt-2 space-y-1 text-sm text-stone-700">
              {onb.requirementLabels.map((r) => (
                <li key={r} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> {r}</li>
              ))}
            </ul>
            <Button className="mt-4" onClick={() => { setPhase("form"); setStep("rep"); }}>Update details</Button>
          </>
        ) : (
          <p className="mt-2 text-sm text-stone-500">Your information is being reviewed — this is usually quick. You can leave this page; we&apos;ll mark PageBee Pay active automatically when it&apos;s approved.</p>
        )}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  // ── Multi-step form ──
  return (
    <div className="mt-6 max-w-2xl">
      {/* Progress */}
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Step {stepIdx + 1} of {STEPS.length}</p>
        <p className="text-xs font-medium capitalize text-stone-500">{STEP_LABELS[step]}</p>
      </div>
      <div className="mb-4 flex items-center gap-1.5">
        {STEPS.map((s, i) => (
          <div key={s} className={cn("h-1.5 flex-1 rounded-full transition-colors", i <= stepIdx ? "bg-amber-400" : "bg-stone-200")} />
        ))}
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-card">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-stone-900 text-amber-300"><Sparkles size={18} /></span>
          <h2 className="font-display text-lg text-stone-900">Activate PageBee Pay</h2>
        </div>

        {step === "type" && (
          <div className="mt-4">
            <p className="text-sm text-stone-500">Tell us how your business is set up.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {(["individual", "company"] as const).map((t) => (
                <label key={t} className={cn("cursor-pointer rounded-xl border p-3 text-sm font-medium", f.businessType === t ? "border-amber-400 bg-amber-50 text-stone-900" : "border-stone-200 text-stone-600")}>
                  <input type="radio" checked={f.businessType === t} onChange={() => set({ businessType: t })} className="mr-2 accent-amber-500" />
                  {t === "individual" ? "Sole proprietor / individual" : "Registered company"}
                </label>
              ))}
            </div>
            <label className="mt-4 grid gap-1 text-sm font-medium text-stone-700">
              Country
              <select value={f.country} onChange={(e) => set({ country: e.target.value })} className="rounded-xl border border-stone-300 px-3 py-2 text-sm">
                {COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
              </select>
            </label>
          </div>
        )}

        {step === "rep" && (
          <div className="mt-4 grid gap-3">
            <p className="text-sm text-stone-500">{isCo ? "Details for the business representative." : "Your details, to verify your identity."}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="First name" value={f.firstName} onChange={(v) => set({ firstName: v })} error={errors.firstName} />
              <Field label="Last name" value={f.lastName} onChange={(v) => set({ lastName: v })} error={errors.lastName} />
              <Field label="Email" value={f.email} onChange={(v) => set({ email: v })} error={errors.email} />
              <Field label="Phone" value={f.phone} onChange={(v) => set({ phone: v })} error={errors.phone} />
            </div>
            <div>
              <p className="text-sm font-medium text-stone-700">Date of birth</p>
              <div className="mt-1 flex gap-2">
                <Input type="number" placeholder="MM" value={f.dobMonth} onChange={(e) => set({ dobMonth: e.target.value ? Number(e.target.value) : "" })} className={cn("w-20", errors.dob && "border-red-400")} />
                <Input type="number" placeholder="DD" value={f.dobDay} onChange={(e) => set({ dobDay: e.target.value ? Number(e.target.value) : "" })} className={cn("w-20", errors.dob && "border-red-400")} />
                <Input type="number" placeholder="YYYY" value={f.dobYear} onChange={(e) => set({ dobYear: e.target.value ? Number(e.target.value) : "" })} className={cn("w-28", errors.dob && "border-red-400")} />
              </div>
              {errors.dob && <p className="mt-1 text-xs text-red-600">{errors.dob}</p>}
            </div>
            <div>
              <Field label="Social Security Number" value={f.ssn} onChange={(v) => set({ ssn: v.replace(/\D/g, "").slice(0, 9) })} className="w-48" placeholder="000-00-0000" error={errors.ssn} />
              {!errors.ssn && <p className="mt-1 text-xs text-stone-400">Required by law to verify your identity. Sent securely; never stored by PageBee.</p>}
            </div>
            <Field label="Street address" value={f.addressLine1} onChange={(v) => set({ addressLine1: v })} error={errors.addressLine1} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="City" value={f.city} onChange={(v) => set({ city: v })} error={errors.city} />
              <label className="grid gap-1 text-sm font-medium text-stone-700">State
                <select value={f.state} onChange={(e) => set({ state: e.target.value })} className={cn("rounded-xl border px-3 py-2 text-sm", errors.state ? "border-red-400" : "border-stone-300")}>
                  <option value="">—</option>
                  {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                {errors.state && <span className="text-xs font-normal text-red-600">{errors.state}</span>}
              </label>
              <Field label="ZIP" value={f.postalCode} onChange={(v) => set({ postalCode: v })} error={errors.postalCode} />
            </div>
          </div>
        )}

        {step === "business" && (
          <div className="mt-4 grid gap-3">
            <Field label={isCo ? "Legal business name" : "Business name (optional)"} value={f.businessName} onChange={(v) => set({ businessName: v })} error={errors.businessName} />
            {isCo && <Field label="Business EIN (9 digits)" value={f.taxId} onChange={(v) => set({ taxId: v.replace(/\D/g, "").slice(0, 9) })} error={errors.taxId} />}
            <label className="grid gap-1 text-sm font-medium text-stone-700">Industry
              <select value={f.mcc} onChange={(e) => set({ mcc: e.target.value })} className={cn("rounded-xl border px-3 py-2 text-sm", errors.mcc ? "border-red-400" : "border-stone-300")}>
                <option value="">Select…</option>
                {MCC_OPTIONS.map((m) => <option key={m.code} value={m.code}>{m.label}</option>)}
              </select>
              {errors.mcc && <span className="text-xs font-normal text-red-600">{errors.mcc}</span>}
            </label>
            <label className="grid gap-1 text-sm font-medium text-stone-700">What do you sell?
              <Textarea rows={2} value={f.productDescription} onChange={(e) => set({ productDescription: e.target.value })} placeholder="e.g. Car cleaning and detailing, billed after each appointment." className={cn(errors.productDescription && "border-red-400")} />
              {errors.productDescription && <span className="text-xs font-normal text-red-600">{errors.productDescription}</span>}
            </label>
          </div>
        )}

        {step === "bank" && (
          <div className="mt-4 grid gap-3">
            <p className="text-sm text-stone-500">Where should we send your money? Entered securely — PageBee never stores these numbers.</p>
            <Field label="Account holder name" value={bank.holderName} onChange={(v) => setBank({ ...bank, holderName: v })} placeholder={`${f.firstName} ${f.lastName}`.trim()} />
            <label className="grid gap-1 text-sm font-medium text-stone-700">Account type
              <select value={bank.holderType} onChange={(e) => setBank({ ...bank, holderType: e.target.value as "individual" | "company" })} className="rounded-xl border border-stone-300 px-3 py-2 text-sm">
                <option value="individual">Individual</option>
                <option value="company">Company</option>
              </select>
            </label>
            <Field label="Routing number" value={bank.routing} onChange={(v) => setBank({ ...bank, routing: v.replace(/\D/g, "").slice(0, 9) })} error={errors.routing} placeholder="9 digits" />
            <Field label="Account number" value={bank.account} onChange={(v) => setBank({ ...bank, account: v.replace(/\D/g, "").slice(0, 17) })} error={errors.account} />
          </div>
        )}

        {step === "review" && (
          <div className="mt-4">
            <p className="text-sm text-stone-500">Quick review before we activate your payouts.</p>
            <dl className="mt-3 space-y-1.5 text-sm">
              <Row k="Business" v={`${f.businessName || `${f.firstName} ${f.lastName}`} · ${isCo ? "Company" : "Individual"}`} />
              <Row k="Representative" v={`${f.firstName} ${f.lastName}`} />
              <Row k="Industry" v={MCC_OPTIONS.find((m) => m.code === f.mcc)?.label ?? "—"} />
              <Row k="Address" v={`${f.addressLine1}, ${f.city}, ${f.state} ${f.postalCode}`} />
              <Row k="Bank" v={`••••${bank.account.slice(-4)} · routing ${bank.routing}`} />
            </dl>
            <label className="mt-4 flex items-start gap-2 text-sm text-stone-600">
              <input type="checkbox" checked={tos} onChange={(e) => setTos(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-stone-300 accent-amber-500" />
              <span>I agree to the <strong>PageBee Pay</strong> terms of service (payments powered by our processing partner) and confirm the information above is accurate.</span>
            </label>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex items-center justify-between">
          {stepIdx > 0 ? (
            <Button variant="ghost" disabled={phase === "submitting"} onClick={back}><ArrowLeft size={15} /> Back</Button>
          ) : <span />}
          {step !== "review" ? (
            <Button onClick={next}>Continue <ArrowRight size={15} /></Button>
          ) : (
            <Button disabled={phase === "submitting"} onClick={submit}>{phase === "submitting" ? "Activating…" : "Activate PageBee Pay"}</Button>
          )}
        </div>
      </div>
      <p className="mt-3 flex items-center gap-1 text-xs text-stone-400"><ShieldCheck size={13} /> Bank-grade encryption. Your details are used only to verify your account and send payouts.</p>
    </div>
  );
}

function Field({ label, value, onChange, className, placeholder, error }: { label: string; value: string; onChange: (v: string) => void; className?: string; placeholder?: string; error?: string }) {
  return (
    <label className="grid gap-1 text-sm font-medium text-stone-700">
      {label}
      <Input value={value} onChange={(e) => onChange(e.target.value)} className={cn(className, error && "border-red-400 focus-visible:ring-red-400")} placeholder={placeholder} />
      {error && <span className="text-xs font-normal text-red-600">{error}</span>}
    </label>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-stone-100 pb-1.5">
      <dt className="text-stone-500">{k}</dt>
      <dd className="text-right font-medium text-stone-800">{v}</dd>
    </div>
  );
}
