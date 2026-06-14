"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const ERR: Record<string, string> = {
  invite_invalid: "This invitation is no longer valid or has expired.",
  already_on_a_team: "Your account is already part of a PageBee team.",
  seat_limit_reached: "This team is full. Ask the owner to free up a seat.",
  password_required: "Please choose a password (at least 8 characters).",
  validation_error: "Please check the form and try again.",
};

export function InviteAccept({
  token,
  email,
  businessName,
  signedIn,
}: {
  token: string;
  email: string;
  businessName: string;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function accept(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signedIn ? { token } : { token, name, password }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; createdAccount?: boolean } | null;
      if (!res.ok) throw new Error(data?.error ?? "failed");

      // New account → sign them in with the password they just set.
      if (!signedIn) {
        const supabase = createSupabaseBrowserClient();
        await supabase.auth.signInWithPassword({ email, password });
      }
      router.push("/client");
      router.refresh();
    } catch (err) {
      setError(ERR[err instanceof Error ? err.message : "failed"] ?? "Something went wrong — please try again.");
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-100";

  return (
    <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-7 shadow-sm">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-400 text-2xl shadow-sm">🐝</span>
      <h1 className="mt-4 font-display text-2xl text-stone-900">Join {businessName}</h1>
      <p className="mt-1 text-sm text-stone-500">
        You&apos;ve been invited to join <strong>{businessName}</strong> on PageBee as a team member.
      </p>

      {signedIn ? (
        <Button className="mt-5 w-full" size="lg" disabled={busy} onClick={() => accept()}>
          <Check size={16} /> {busy ? "Joining…" : "Accept & join"}
        </Button>
      ) : (
        <form onSubmit={accept} className="mt-5 grid gap-3">
          <label className="grid gap-1 text-sm font-medium text-stone-700">
            Email
            <input value={email} readOnly className={`${inputCls} bg-stone-50 text-stone-500`} />
          </label>
          <label className="grid gap-1 text-sm font-medium text-stone-700">
            Your name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Smith" className={inputCls} />
          </label>
          <label className="grid gap-1 text-sm font-medium text-stone-700">
            Choose a password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} placeholder="At least 8 characters" className={inputCls} />
          </label>
          <Button type="submit" size="lg" disabled={busy} className="mt-1 w-full">
            {busy ? "Creating your account…" : "Create account & join"}
          </Button>
        </form>
      )}

      {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
    </div>
  );
}
