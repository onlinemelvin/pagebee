// Public, non-secret identifiers safe to embed in the frontend.

/**
 * Site token for the seeded demo tenant. A real generated client website would
 * receive its own unique token; this one wires the marketing site's contact
 * form to the public Lead API so the end-to-end flow is demonstrable.
 * It is a *public* token by design (see docs/ARCHITECTURE.md §5).
 */
export const DEMO_SITE_TOKEN = "site_demo_pagebee";
