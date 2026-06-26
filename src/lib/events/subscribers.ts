import { on } from "@/lib/events";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/modules/email";
import * as notify from "@/lib/modules/email/notifications";
import * as customerNotify from "@/lib/modules/email/customer-notifications";
import { upsertCustomerFromLead } from "@/lib/modules/customer";
import { createNotification, isGroupEmailAllowed } from "@/lib/modules/notification";
import { notifyOwnerSms } from "@/lib/modules/messaging";
import type { Lead, Booking } from "@prisma/client";

// Public origin for deep links inside SMS alerts (owner taps through to the web app to reply).
function appBase(): string {
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
  return `${root.includes("localhost") ? "http" : "https"}://${root}`;
}

// Escape user-supplied values before embedding in notification HTML.
function esc(s: string | null | undefined): string {
  return String(s ?? "—").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Resolve the business owner's inbox for a tenant (falls back to the platform
// inbox only when the owner has no email on file).
async function ownerInbox(clientId: string): Promise<string> {
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { ownerEmail: true } });
  return client?.ownerEmail || process.env.RESEND_FROM_EMAIL || "owner@pagebee.com";
}

// Register domain-event handlers exactly once (survives dev hot reload).
const globalForSubs = globalThis as unknown as { __pagebeeSubscribers?: boolean };

if (!globalForSubs.__pagebeeSubscribers) {
  globalForSubs.__pagebeeSubscribers = true;

  on("lead.created", async (payload) => {
    const { lead } = payload as { lead: Lead };

    // Auto-add the lead to the CRM: link to an existing contact (by email/phone) or create one. Fail-
    // soft — a CRM hiccup must never block lead capture or the owner notification below.
    let customerId: string | null = null;
    try {
      customerId = await upsertCustomerFromLead(lead);
    } catch (err) {
      console.error("[event:lead.created] customer upsert failed", err);
    }

    // Auto-reply to the customer from the client business ("we received your inquiry").
    if (lead.email) {
      await customerNotify.sendInquiryAck(lead.clientId, {
        to: lead.email,
        customerId,
        customerName: lead.name,
        message: lead.message,
      });
    }

    // In-app notification for the owner (always — the bell isn't gated by email prefs).
    await createNotification({
      clientId: lead.clientId,
      type: "lead.created",
      title: `New inquiry from ${lead.name || "a visitor"}`,
      body: lead.message ? lead.message.slice(0, 120) : "Respond from your inquiries inbox.",
    });

    // One-way SMS alert with a deep link to the inbox — owner taps through and replies in the web
    // app. Fail-soft and self-gating (opt-in + plan + allowance + STOP list all checked inside).
    await notifyOwnerSms(
      lead.clientId,
      "inquiries",
      `New lead${lead.name ? ` from ${lead.name}` : ""}${lead.phone ? ` (${lead.phone})` : ""}. View & reply: ${appBase()}/client/inquiries`,
    );

    // Notify the actual business owner by email — gated by their opt-in (falls back to the
    // platform inbox only if none on file).
    if (await isGroupEmailAllowed(lead.clientId, "inquiries")) {
      await sendEmail({
        to: await ownerInbox(lead.clientId),
        subject: `New ${lead.type.toLowerCase().replace("_", " ")} lead: ${lead.name}`,
        html: `
          <h2>New lead captured</h2>
          <p><strong>Name:</strong> ${esc(lead.name)}</p>
          <p><strong>Email:</strong> ${esc(lead.email)}</p>
          <p><strong>Phone:</strong> ${esc(lead.phone)}</p>
          <p><strong>Message:</strong> ${esc(lead.message)}</p>
          <p><strong>Source:</strong> ${esc(lead.source)}</p>
        `,
      });
    }
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

    // In-app notification for the owner (always).
    await createNotification({
      clientId: booking.clientId,
      type: "booking.created",
      title: `New appointment request: ${booking.serviceName}`,
      body: `${customer.name || "A customer"} · ${booking.startAt.toLocaleString()}`,
    });

    // One-way SMS alert with a deep link to the calendar (fail-soft, self-gating).
    await notifyOwnerSms(
      booking.clientId,
      "appointments",
      `New appointment request: ${booking.serviceName} — ${booking.startAt.toLocaleString()}. Review: ${appBase()}/client/appointments`,
    );

    // Email the owner — gated by their opt-in.
    if (await isGroupEmailAllowed(booking.clientId, "appointments")) {
      await sendEmail({
        to: await ownerInbox(booking.clientId),
        subject: `New appointment request: ${booking.serviceName}`,
        html: `
          <h2>New appointment request</h2>
          <p><strong>Service:</strong> ${esc(booking.serviceName)}</p>
          <p><strong>When:</strong> ${esc(booking.startAt.toLocaleString())}</p>
          <p><strong>Name:</strong> ${esc(customer.name)}</p>
          <p><strong>Email:</strong> ${esc(customer.email)}</p>
          <p><strong>Phone:</strong> ${esc(customer.phone)}</p>
          <p><strong>Notes:</strong> ${esc(booking.notes)}</p>
        `,
      });
    }
  });

  // Platform → client: a purchased/connected custom domain is now serving the
  // live site. Mirrors the website "domain live" milestone.
  on("domain.active", async (payload) => {
    const { clientId, domain } = payload as { clientId?: string; domain?: string };
    if (clientId) {
      await createNotification({
        clientId,
        type: "domain_active",
        body: domain ? `${domain} is now serving your website.` : "Your custom domain is now live.",
      });
    }
  });
}
