import Link from "next/link";
import { getInvite } from "@/lib/modules/team";
import { getAuthContext } from "@/lib/auth/session";
import { InviteAccept } from "@/components/client/InviteAccept";
import { LogoMark } from "@/components/brand/Logo";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await getInvite(token);
  const ctx = await getAuthContext();

  return (
    <main className="grid min-h-screen place-items-center bg-stone-50 p-6">
      {!invite ? (
        <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-7 text-center shadow-sm">
          <LogoMark size={48} className="mx-auto" />
          <h1 className="mt-4 font-display text-2xl text-stone-900">Invitation not available</h1>
          <p className="mt-1 text-sm text-stone-500">This invite link is invalid, was revoked, or has expired. Ask the team owner to send a new one.</p>
          <Link href="/login" className="mt-5 inline-block rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-stone-950 hover:bg-amber-300">Go to sign in</Link>
        </div>
      ) : (
        <InviteAccept token={token} email={invite.email} businessName={invite.businessName} signedIn={Boolean(ctx)} />
      )}
    </main>
  );
}
