import { getClientWorkspace } from "@/lib/modules/client";
import { listMedia } from "@/lib/modules/media";
import { MediaManager } from "@/components/client/MediaManager";

export const dynamic = "force-dynamic";

export default async function ClientMediaPage() {
  const ws = await getClientWorkspace();
  if (!ws) return null;
  const items = await listMedia(ws.client.id);
  const gallery = ws.features.find((f) => f.key === "gallery");

  return (
    <div>
      <h1 className="font-display text-3xl text-stone-900">Media library</h1>
      <p className="mt-1 text-stone-500">
        Your reusable images. Upload photos here once and use them across your website — like your gallery,
        hero, or services. You can add or remove images anytime.
      </p>

      <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-card">
        <MediaManager
          initial={items}
          galleryEnabled={gallery?.state === "enabled"}
          galleryLocked={gallery?.state === "locked"}
          galleryBlockedReason={gallery?.blockedReason ?? null}
        />
      </div>
    </div>
  );
}
