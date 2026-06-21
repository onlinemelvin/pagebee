import Link from "next/link";
import { Users, ArrowUpRight } from "lucide-react";
import { getClientWorkspace } from "@/lib/modules/client";
import { getAuthContext } from "@/lib/auth/session";
import { listTeam } from "@/lib/modules/team";
import { TeamManager } from "@/components/client/TeamManager";
import { EmptyState } from "@/components/client/ui/EmptyState";

export const dynamic = "force-dynamic";

export default async function ClientTeamPage() {
  const ws = await getClientWorkspace();
  if (!ws) return null;

  return (
    <div>
      <h1 className="font-display text-3xl text-stone-900">Team</h1>
      <p className="mt-1 text-stone-500">Invite teammates to help manage inquiries, appointments, and invoices.</p>

      {ws.caps.teamSeats <= 1 ? (
        <EmptyState
          className="mt-6"
          icon={Users}
          title="Add your team on a higher plan"
          description="Connect includes 3 seats and Automate includes unlimited, so your staff can log in and help run the business. Your current plan is single-user."
          cta={{ label: "See plans & upgrade", href: "/client/billing", icon: ArrowUpRight }}
        />
      ) : (
        <TeamContent clientId={ws.client.id} seats={ws.caps.teamSeats} unlimited={ws.caps.teamSeatsUnlimited} />
      )}

      <p className="mt-6 text-xs text-stone-400">
        Your plan includes {ws.caps.teamSeatsUnlimited ? "unlimited" : ws.caps.teamSeats} seat{!ws.caps.teamSeatsUnlimited && ws.caps.teamSeats === 1 ? "" : "s"}.{" "}
        <Link href="/client/billing" className="font-medium text-amber-700 hover:underline">Need more?</Link>
      </p>
    </div>
  );
}

async function TeamContent({ clientId, seats, unlimited }: { clientId: string; seats: number; unlimited: boolean }) {
  const ctx = await getAuthContext();
  const state = await listTeam(clientId, ctx?.userId ?? "");
  // Keep the live seat limit authoritative (plan flags), in case it changed since load.
  state.seatsUnlimited = unlimited;
  if (!unlimited) state.seatLimit = seats;
  const isOwner = state.members.find((m) => m.isYou)?.role === "owner";
  return <TeamManager state={state} isOwner={isOwner} />;
}
