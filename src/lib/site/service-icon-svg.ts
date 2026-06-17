import { SERVICE_ICON_SVGS } from "./service-icon-svgs";

// Generated tenant sites are plain self-contained HTML with no icon library, so the public
// services feed ships each service's icon as a ready-to-inject inline SVG. The SVGs are
// pre-rendered into SERVICE_ICON_SVGS (a plain data module) so this stays dependency-free —
// importing react-dom/server here would break the App Router route that consumes it.

/** Inline SVG string for a stored service icon key. Unknown/empty keys → "sparkles". */
export function serviceIconSvg(key: string | null | undefined): string {
  return (key && SERVICE_ICON_SVGS[key]) || SERVICE_ICON_SVGS.sparkles;
}
