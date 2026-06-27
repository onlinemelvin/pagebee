import { redirect } from "next/navigation";
import { getAuthContext, getRepContext } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Post-login router: send each user to the right home by role. */
export default async function DashboardPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (ctx.isAdmin) redirect("/admin");
  if (ctx.type === "CLIENT") redirect("/client");
  // A PLATFORM user who is a commission rep (not admin) belongs in the rep portal.
  if (ctx.type === "PLATFORM" && (await getRepContext())) redirect("/rep");
  redirect("/login");
}
