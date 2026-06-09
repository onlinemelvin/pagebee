"use client";

import * as React from "react";

/** Contact form rendered on a tenant's live site; posts to the public Lead API
 *  using that site's token, so the lead is attributed to the right tenant. */
export function SiteContactForm({ siteToken, accent }: { siteToken: string; accent: string }) {
  const [status, setStatus] = React.useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setError(null);
    const form = e.currentTarget;
    const data = new FormData(form);
    try {
      const res = await fetch("/api/v1/public/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${siteToken}` },
        body: JSON.stringify({
          type: "CONTACT_FORM",
          name: data.get("name"),
          email: data.get("email"),
          phone: data.get("phone") || undefined,
          message: data.get("message") || undefined,
          source: "site",
        }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      form.reset();
      setStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-2xl border border-black/10 bg-black/[0.03] p-8 text-center">
        <p className="text-xl font-semibold">Thanks — we&apos;ll be in touch shortly.</p>
      </div>
    );
  }

  const inputCls =
    "w-full rounded-xl border border-black/15 bg-white px-4 py-3 text-sm outline-none focus:border-black/40";

  return (
    <form onSubmit={handleSubmit} className="grid gap-3">
      <input name="name" required placeholder="Your name" className={inputCls} autoComplete="name" />
      <div className="grid gap-3 sm:grid-cols-2">
        <input name="email" type="email" required placeholder="Email" className={inputCls} autoComplete="email" />
        <input name="phone" type="tel" placeholder="Phone (optional)" className={inputCls} autoComplete="tel" />
      </div>
      <textarea name="message" rows={4} placeholder="How can we help?" className={inputCls} />
      {status === "error" && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={status === "submitting"}
        className="rounded-full px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        style={{ background: accent }}
      >
        {status === "submitting" ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
