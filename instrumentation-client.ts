import posthog from "posthog-js";

posthog.init(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN!, {
  api_host: "/ingest",
  ui_host: "https://us.posthog.com",
  defaults: "2026-01-30",
  capture_exceptions: true,
  // Core Web Vitals capture pulls a separate external script that's frequently blocked (ad/tracker
  // blockers match the `web-vitals` asset) and logged its failure to the console. We don't use the
  // Web Vitals dashboards, so skip that script entirely while keeping the rest of performance/network
  // capture on. Remove this override to re-enable Web Vitals.
  capture_performance: { web_vitals: false },
  debug: process.env.NODE_ENV === "development",
});
