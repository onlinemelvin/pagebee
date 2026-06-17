"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/**
 * Periodically refreshes the current server-rendered route so live data (e.g. generation
 * progress) updates without a manual reload. Mount it only when there's something in flight.
 */
export function AutoRefresh({ intervalMs = 3000 }: { intervalMs?: number }) {
  const router = useRouter();
  React.useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return null;
}
