import { on } from "@/lib/events";
import { sendEmail } from "@/lib/modules/email";
import * as notify from "@/lib/modules/email/notifications";
import { upsertCustomerFromLead } from "@/lib/modules/customer";
import type { Lead, Booking } from "@prisma/client";

// Register domain-event handlers exactly once (survives dev hot reload).
const globalForSubs = globalThis as unknown as { __pagebeeSubscribers?: boolean };

if (!globalForSubs.__pagebeeSubscribers) {
  globalForSubs.__pagebeeSubscribers = true;

  on("lead.created", async (payload) => {
    const { lead } = payload as { lead: Lead };

    // Auto-add the lead to the CRM: link to an existing contact (by email/phone) or create one. Fail-
    // soft — a CRM hiccup must never block lead capture or the owner notification below.
    try {
      await upsertCustomerFromLead(lead);
    } catch (err) {
      console.error("[event:lead.created] customer upsert failed", err);
    }

    // TODO: look up the client owner's email; for now notify the platform inbox.
    const ownerEmail = process.env.RESEND_FROM_EMAIL ?? "owner@pagebee.com";
    await sendEmail({
      to: ownerEmail,
      subject: `New ${lead.type.toLowerCase().replace("_", " ")} lead: ${lead.name}`,
      html: `
        <h2>New lead captured</h2>
        <p><strong>Name:</strong> ${lead.name}</p>
        <p><strong>Email:</strong> ${lead.email ?? "—"}</p>
        <p><strong>Phone:</strong> ${lead.phone ?? "—"}</p>
        <p><strong>Message:</strong> ${lead.message ?? "—"}</p>
        <p><strong>Source:</strong> ${lead.source ?? "—"}</p>
      `,
    });
  });

  // Platform → client: the website preview has been released for the owner to
  // review. Mirror of the "preview ready" notification.
  on("website.preview_released", async (payload) => {
    const { clientId } = payload as { clientId?: string };
    if (clientId) await notify.sendPreviewReady(clientId);
  });

  on("booking.created", async (payload) => {
    const { booking, customer } = payload as {
      booking: Booking;
      customer: { name: string; email?: string; phone?: string };
    };
    const ownerEmail = process.env.RESEND_FROM_EMAIL ?? "owner@pagebee.com";
    await sendEmail({
      to: ownerEmail,
      subject: `New appointment request: ${booking.serviceName}`,
      html: `
        <h2>New appointment request</h2>
        <p><strong>Service:</strong> ${booking.serviceName}</p>
        <p><strong>When:</strong> ${booking.startAt.toLocaleString()}</p>
        <p><strong>Name:</strong> ${customer.name}</p>
        <p><strong>Email:</strong> ${customer.email ?? "—"}</p>
        <p><strong>Phone:</strong> ${customer.phone ?? "—"}</p>
        <p><strong>Notes:</strong> ${booking.notes ?? "—"}</p>
      `,
    });
  });
}
