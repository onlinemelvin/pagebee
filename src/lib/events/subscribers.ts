import { on } from "@/lib/events";
import { sendEmail } from "@/lib/modules/email";
import type { Lead } from "@prisma/client";

// Register domain-event handlers exactly once (survives dev hot reload).
const globalForSubs = globalThis as unknown as { __pagebeeSubscribers?: boolean };

if (!globalForSubs.__pagebeeSubscribers) {
  globalForSubs.__pagebeeSubscribers = true;

  on("lead.created", async (payload) => {
    const { lead } = payload as { lead: Lead };
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
}
