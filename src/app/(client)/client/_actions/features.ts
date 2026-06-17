"use server";

import { revalidatePath } from "next/cache";
import { requireClient, AuthError } from "@/lib/auth/session";
import { getClientWorkspace, setClientFeature } from "@/lib/modules/client";

export type ToggleFeatureResult = { ok: true } | { ok: false; error: string; message?: string };

/**
 * Enable/disable a client feature flag from a client component (the Media gallery switch and the
 * Website "Add features" cards). A Server Action — not the /api/v1/client/features route — because
 * its `revalidatePath` calls evict the *other* page's Router Cache entry too, so a toggle on one
 * page is reflected on the other without a hard reload. A plain fetch + route-handler revalidatePath
 * does NOT purge sibling-route client cache; router.refresh() only refreshes the current route.
 */
export async function toggleFeature(key: string, enabled: boolean): Promise<ToggleFeatureResult> {
  let client;
  try {
    ({ client } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) return { ok: false, error: err.message };
    throw err;
  }

  const ws = await getClientWorkspace();
  if (!ws) return { ok: false, error: "unauthorized" };

  // The key must map to a real feature card; you can't enable something locked to a higher tier,
  // or a gallery when every page/section slot in the plan is already used. (Mirrors the route.)
  const feature = ws.features.find((f) => f.toggleKey === key);
  if (!feature) return { ok: false, error: "unknown_feature" };
  if (enabled && feature.state === "locked") return { ok: false, error: "feature_not_in_plan" };
  if (enabled && feature.blockedReason) return { ok: false, error: "no_page_room", message: feature.blockedReason };

  await setClientFeature(client.id, key, enabled);
  // Every page under the client layout reads feature flags, so purge the subtree's cache — both the
  // Media gallery switch and the Website feature cards must reflect the change immediately.
  revalidatePath("/client", "layout");
  return { ok: true };
}
