import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Post-login router: send each user to the right home by role. */
export default async function DashboardPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (ctx.isAdmin) redirect("/admin");
  if (ctx.type === "CLIENT") redirect("/client");
  redirect("/login");
}
