"use client";

import * as React from "react";
import { UploadCloud, Trash2, ImageOff } from "lucide-react";
import type { MediaItemDTO } from "@/lib/modules/media";

/** The client's reusable media library: upload new images and remove old ones. */
export function MediaManager({ initial }: { initial: MediaItemDTO[] }) {
  const [items, setItems] = React.useState<MediaItemDTO[]>(initial);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    setError(null);
    for (const f of files) {
      const fd = new FormData();
      fd.append("file", f);
      try {
        const res = await fetch("/api/v1/client/media", { method: "POST", body: fd });
        if (!res.ok) throw new Error(String(res.status));
        const { item } = (await res.json()) as { item: MediaItemDTO };
        setItems((prev) => [item, ...prev]);
      } catch {
        setError("Some images failed to upload — try smaller files (max 5MB).");
      }
    }
    setUploading(false);
    e.target.value = "";
  }

  async function remove(id: string) {
    const prev = items;
    setItems((p) => p.filter((m) => m.id !== id)); // optimistic
    const res = await fetch(`/api/v1/client/media/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setItems(prev); // revert
      setError("Couldn't delete that image. Please try again.");
    }
  }

  return (
    <div className="mt-6">
      {/* Dropzone */}
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-stone-300 bg-white px-6 py-10 text-center transition hover:border-amber-300 hover:bg-amber-50/40">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-b from-amber-200/70 to-amber-50 text-amber-600 shadow-sm">
          <UploadCloud size={24} />
        </span>
        <span className="font-display text-lg text-stone-900">{uploading ? "Uploading…" : "Upload images"}</span>
        <span className="text-sm text-stone-500">Click to browse or drop files here · JPG/PNG up to 5MB each</span>
        <input type="file" accept="image/*" multiple onChange={onUpload} disabled={uploading} className="hidden" />
      </label>
      {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <div className="mt-4 flex items-center justify-between">
        <span className="text-sm text-stone-500">{items.length} image{items.length === 1 ? "" : "s"}</span>
      </div>

      {items.length === 0 && !uploading ? (
        <div className="mt-2 flex flex-col items-center rounded-2xl border border-dashed border-stone-200 bg-stone-50/60 px-6 py-10 text-center text-stone-400">
          <ImageOff size={26} />
          <p className="mt-2 max-w-xs text-sm">Your library is empty. Upload photos once and reuse them across your website — gallery, hero, and services.</p>
        </div>
      ) : (
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {uploading && <div className="skeleton aspect-square w-full rounded-xl" />}
          {items.map((m) => (
            <div key={m.id} className="group anim-rise relative overflow-hidden rounded-xl border border-stone-200 bg-stone-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.url} alt={m.alt ?? m.name ?? ""} loading="lazy" className="aspect-square w-full object-cover transition group-hover:scale-105" />
              <button
                type="button"
                onClick={() => remove(m.id)}
                className="absolute right-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-full bg-stone-900/75 text-white opacity-0 backdrop-blur-sm transition hover:bg-rose-600 group-hover:opacity-100"
                aria-label="Delete image"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
