import { NextResponse } from "next/server";
import { verifyResendSignature, handleResendEvent } from "@/lib/modules/email/tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/webhooks/resend — delivery/open/bounce tracking from Resend
 *  (Svix-signed). Updates EmailLog status + campaign roll-ups. */
export async function POST(req: Request) {
  const raw = await req.text();
  const ok = verifyResendSignature(
    {
      id: req.headers.get("svix-id"),
      timestamp: req.headers.get("svix-timestamp"),
      signature: req.headers.get("svix-signature"),
    },
    raw,
  );
  if (!ok) return NextResponse.json({ error: "invalid_signature" }, { status: 400 });

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  try {
    await handleResendEvent(event);
  } catch (err) {
    console.error("[resend webhook] processing error", err);
    return NextResponse.json({ error: "processing_error" }, { status: 500 }); // Resend retries
  }
  return NextResponse.json({ received: true });
}
