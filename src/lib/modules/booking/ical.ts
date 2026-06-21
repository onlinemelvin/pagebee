import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { signingSecret } from "@/lib/secret";

// Stateless, subscribable calendar feed (like Google Calendar's "secret address"):
// the URL carries a signed token so it works in any calendar app without a login,
// and can't be guessed for another client. No DB column needed.

function secret(): string {
  return signingSecret("ICAL_FEED_SECRET", "SUPABASE_SERVICE_ROLE_KEY");
}

function sign(clientId: string): string {
  return crypto.createHmac("sha256", secret()).update(clientId).digest("hex").slice(0, 32);
}

/** Opaque feed token for a client: `<clientId>.<sig>`. */
export function icalToken(clientId: string): string {
  return `${clientId}.${sign(clientId)}`;
}

/** Returns the clientId if the token is valid, else null (timing-safe). */
export function verifyIcalToken(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const clientId = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(clientId);
  if (sig.length !== expected.length) return null;
  try {
    if (crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return clientId;
  } catch {
    return null;
  }
  return null;
}

function icsTime(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

const ICS_STATUS: Record<string, string> = {
  CONFIRMED: "CONFIRMED",
  RESCHEDULED: "CONFIRMED",
  COMPLETED: "CONFIRMED",
  REQUESTED: "TENTATIVE",
  CANCELLED: "CANCELLED",
  NO_SHOW: "CANCELLED",
};

/** Build an RFC-5545 iCalendar feed of a client's bookings (recent + upcoming). */
export async function buildIcsFeed(clientId: string): Promise<string> {
  const now = Date.now();
  const [client, bookings] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId }, select: { businessName: true } }),
    prisma.booking.findMany({
      where: {
        clientId,
        startAt: { gte: new Date(now - 30 * 86_400_000), lte: new Date(now + 180 * 86_400_000) },
      },
      include: { customer: { select: { name: true, phone: true } } },
      orderBy: { startAt: "asc" },
      take: 500,
    }),
  ]);

  const calName = `${client?.businessName ?? "PageBee"} — Appointments`;
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PageBee//Appointments//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(calName)}`,
    "X-PUBLISHED-TTL:PT1H",
  ];

  for (const b of bookings) {
    const who = b.customer?.name ? ` — ${b.customer.name}` : "";
    const descParts = [b.notes, b.customer?.phone].filter(Boolean) as string[];
    lines.push(
      "BEGIN:VEVENT",
      `UID:${b.id}@pagebee`,
      `DTSTAMP:${icsTime(new Date())}`,
      `DTSTART:${icsTime(b.startAt)}`,
      `DTEND:${icsTime(b.endAt)}`,
      `SUMMARY:${esc(b.serviceName + who)}`,
      `STATUS:${ICS_STATUS[b.status] ?? "CONFIRMED"}`,
    );
    if (descParts.length) lines.push(`DESCRIPTION:${esc(descParts.join(" · "))}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  // RFC 5545 uses CRLF line endings.
  return lines.join("\r\n") + "\r\n";
}
