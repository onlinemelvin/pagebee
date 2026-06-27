"use client";

import * as React from "react";
import posthog from "posthog-js";

/**
 * Fire a PostHog `*_viewed` event once when a page/section mounts. Drop into server components to
 * satisfy the observability requirement without making the whole page a client component.
 */
export function TrackView({ event, props }: { event: string; props?: Record<string, unknown> }) {
  React.useEffect(() => {
    posthog.capture(event, props);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);
  return null;
}
