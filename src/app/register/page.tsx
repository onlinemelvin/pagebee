import type { Metadata } from "next";
import { RegisterForm } from "@/components/marketing/RegisterForm";
import type { PlanName } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Get started",
  description: "Choose a plan and create your PageBee account — see your new website free, no card required.",
};

const PLAN_NAMES = ["LAUNCH", "CONNECT", "AUTOMATE"];

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const { plan } = await searchParams;
  const initialPlan = plan && PLAN_NAMES.includes(plan) ? (plan as PlanName) : null;
  return <RegisterForm initialPlan={initialPlan} />;
}
