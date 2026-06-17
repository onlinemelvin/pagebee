// Minimal in-process event bus. Domain services emit events; handlers fan out to
// email/SMS/analytics/audit (see docs/ARCHITECTURE.md §7). This is a placeholder
// for a durable job runner (Inngest/Trigger.dev) — same emit() surface later.

export type DomainEvent =
  | "lead.created"
  | "booking.created"
  | "invoice.created"
  | "invoice.paid"
  | "payment.failed"
  | "quote.created"
  | "website.generated"
  | "website.preview_released"
  | "website.published"
  | "domain.requested"
  | "domain.approved"
  | "domain.active";

type Handler = (payload: unknown) => void | Promise<void>;

const globalForEvents = globalThis as unknown as {
  __pagebeeEvents?: Record<string, Handler[]>;
};
const registry: Record<string, Handler[]> = (globalForEvents.__pagebeeEvents ??= {});

export function on(event: DomainEvent, handler: Handler): void {
  (registry[event] ??= []).push(handler);
}

export async function emit(event: DomainEvent, payload: unknown): Promise<void> {
  console.log(`[event] ${event}`);
  const handlers = registry[event] ?? [];
  await Promise.all(
    handlers.map(async (h) => {
      try {
        await h(payload);
      } catch (err) {
        console.error(`[event:${event}] handler error`, err);
      }
    }),
  );
}
