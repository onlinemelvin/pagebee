"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BrainCircuit, FileText, Image as ImageIcon, Upload, Trash2, Check, Plus, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { KnowledgeData, KnowledgeDocDTO } from "@/lib/modules/knowledge";

const inputCls = "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-100";

/** Owner editor for the AI knowledge base: curated text fields + uploaded documents/images. Feeds
 *  both website generation and the chat AI. */
export function KnowledgeEditor({ initialData, initialDocs, canEdit }: { initialData: KnowledgeData; initialDocs: KnowledgeDocDTO[]; canEdit: boolean }) {
  const router = useRouter();
  const [data, setData] = React.useState<KnowledgeData>(initialData);
  const [docs, setDocs] = React.useState<KnowledgeDocDTO[]>(initialDocs);
  const [saved, setSaved] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [uploadErr, setUploadErr] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const savedTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  async function save(next: Partial<KnowledgeData>) {
    if (!canEdit) return;
    const optimistic = { ...data, ...next };
    setData(optimistic);
    setBusy(true);
    try {
      const res = await fetch("/api/v1/client/knowledge", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error();
      const d = (await res.json()) as { data: KnowledgeData };
      setData(d.data);
      setSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 1800);
    } catch {
      setData(data); // revert
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File) {
    setUploading(true);
    setUploadErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/v1/client/knowledge/documents", { method: "POST", body: fd });
      const d = (await res.json().catch(() => null)) as { document?: KnowledgeDocDTO; error?: string } | null;
      if (!res.ok || !d?.document) throw new Error(d?.error ?? "failed");
      setDocs((cur) => [d.document!, ...cur]);
    } catch (err) {
      const code = err instanceof Error ? err.message : "failed";
      setUploadErr(code === "unsupported_type" ? "That file type isn't supported (use PDF, Word, text, or an image)." : code === "file_too_large" ? "File too large (max 5 MB)." : "Couldn't process that file — try again.");
    } finally {
      setUploading(false);
    }
  }

  async function removeDoc(id: string) {
    setDocs((cur) => cur.filter((d) => d.id !== id)); // optimistic
    await fetch(`/api/v1/client/knowledge/documents/${id}`, { method: "DELETE" }).catch(() => router.refresh());
  }

  // ── FAQs ──
  function setFaq(i: number, key: "q" | "a", val: string) {
    setData((d) => ({ ...d, faqs: d.faqs.map((f, j) => (j === i ? { ...f, [key]: val } : f)) }));
  }
  function addFaq() {
    setData((d) => ({ ...d, faqs: [...d.faqs, { q: "", a: "" }] }));
  }
  function removeFaq(i: number) {
    const next = data.faqs.filter((_, j) => j !== i);
    setData((d) => ({ ...d, faqs: next }));
    save({ faqs: next });
  }

  const fieldCard = (title: string, hint: string, key: "about" | "details" | "policies", rows: number) => (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-card">
      <p className="font-display text-base text-stone-900">{title}</p>
      <p className="mt-0.5 text-sm text-stone-500">{hint}</p>
      <Textarea
        className="mt-3"
        rows={rows}
        value={data[key]}
        disabled={!canEdit}
        onChange={(e) => setData((d) => ({ ...d, [key]: e.target.value }))}
        onBlur={() => data[key] !== initialData[key] && save({ [key]: data[key] })}
      />
    </div>
  );

  return (
    <div className="mt-6 space-y-5">
      <div className="flex items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-4">
        <BrainCircuit className="shrink-0 text-violet-600" size={22} />
        <p className="text-sm text-violet-900">
          Everything here is what your AI <strong>knows</strong> — it grounds your generated website copy and powers the chat assistant&apos;s answers. The more you add, the fewer questions get escalated to you.
        </p>
      </div>

      {fieldCard("About your business", "A clear summary — what you do, who you serve, what makes you different.", "about", 4)}
      {fieldCard("Details the AI should know", "Anything useful: hours nuances, areas served, processes, guarantees, specialties, what you do/don't do.", "details", 6)}
      {fieldCard("Policies", "Cancellation, refunds, warranties, payment terms — so the AI answers these accurately.", "policies", 4)}

      {/* FAQs */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-card">
        <p className="font-display text-base text-stone-900">FAQs</p>
        <p className="mt-0.5 text-sm text-stone-500">Common questions and your answers — used on the site and by the chat.</p>
        <div className="mt-3 space-y-3">
          {data.faqs.map((f, i) => (
            <div key={i} className="rounded-xl border border-stone-200 p-3">
              <div className="flex items-start gap-2">
                <input className={inputCls} placeholder="Question" value={f.q} disabled={!canEdit} onChange={(e) => setFaq(i, "q", e.target.value)} onBlur={() => save({ faqs: data.faqs })} />
                {canEdit && (
                  <button onClick={() => removeFaq(i)} className="mt-1 shrink-0 text-stone-400 hover:text-rose-600" aria-label="Remove FAQ"><X size={16} /></button>
                )}
              </div>
              <Textarea className="mt-2" rows={2} placeholder="Answer" value={f.a} disabled={!canEdit} onChange={(e) => setFaq(i, "a", e.target.value)} onBlur={() => save({ faqs: data.faqs })} />
            </div>
          ))}
        </div>
        {canEdit && <Button variant="outline" size="sm" className="mt-3" onClick={addFaq}><Plus size={14} /> Add FAQ</Button>}
      </div>

      {/* Documents + images */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-display text-base text-stone-900">Documents &amp; images</p>
            <p className="mt-0.5 text-sm text-stone-500">Upload a policy PDF, a Word doc, a price list, or company photos — we read the text and describe images so the AI can use them.</p>
          </div>
          {canEdit && (
            <>
              <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt,.md,.csv,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
              <Button size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? <><Loader2 size={14} className="animate-spin" /> Processing…</> : <><Upload size={14} /> Upload</>}
              </Button>
            </>
          )}
        </div>
        {uploadErr && <p className="mt-2 text-sm text-rose-600">{uploadErr}</p>}

        {docs.length > 0 && (
          <ul className="mt-4 divide-y divide-stone-100">
            {docs.map((d) => (
              <li key={d.id} className="flex items-start gap-3 py-3">
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-stone-100 text-stone-500">
                  {d.kind === "image" ? <ImageIcon size={16} /> : <FileText size={16} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <a href={d.url} target="_blank" rel="noopener noreferrer" className="truncate font-medium text-stone-900 hover:underline">{d.name}</a>
                    <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-stone-500">{d.kind}</span>
                  </span>
                  <span className="mt-0.5 block text-xs text-stone-500">
                    {d.hasText ? <>{d.kind === "image" ? "AI description: " : ""}{d.preview}{d.charCount > 280 ? "…" : ""}</> : <span className="text-amber-600">No text could be read from this file — the AI can&apos;t use it.</span>}
                  </span>
                </span>
                {canEdit && (
                  <button onClick={() => removeDoc(d.id)} className="shrink-0 text-stone-400 hover:text-rose-600" aria-label={`Remove ${d.name}`}><Trash2 size={15} /></button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex h-5 items-center gap-1.5 text-xs">
        {busy ? <span className="text-stone-400">Saving…</span> : saved ? <><Check size={13} className="text-emerald-500" /> <span className="text-emerald-600">Saved</span></> : null}
      </div>
    </div>
  );
}
