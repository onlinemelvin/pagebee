import { NextResponse } from "next/server";
import { verifyIcalToken, buildIcsFeed } from "@/lib/modules/booking/ical";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/ical/{token}.ics — subscribable calendar feed of a client's bookings.
 *  The signed token authorizes access (capability URL); no login required. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const clientId = verifyIcalToken(token.replace(/\.ics$/i, ""));
  if (!clientId) return new NextResponse("Invalid feed token", { status: 404 });

  const ics = await buildIcsFeed(clientId);
  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="pagebee-appointments.ics"',
      "Cache-Control": "private, max-age=300",
    },
  });
}
