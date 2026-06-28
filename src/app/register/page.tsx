import type { Metadata } from "next";
import { RegisterForm } from "@/components/marketing/RegisterForm";
import { getPreviewClaim } from "@/lib/modules/registration";
import type { PlanName } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Get started",
  description: "Choose a plan and create your PageBee account — see your new website free, no card required.",
};

const PLAN_NAMES = ["NECTAR", "HONEY", "HIVE"];

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; previewToken?: string }>;
}) {
  const { plan, previewToken } = await searchParams;

  // Arriving from a public preview's "Ready to launch" CTA: prefill from the provisional account and
  // lock the plan to the preview's, so signup adopts that preview. A claimed/invalid token falls
  // back to a normal signup.
  const claim = previewToken ? await getPreviewClaim(previewToken) : null;
  if (claim && !claim.claimed) {
    return (
      <RegisterForm
        initialPlan={claim.plan}
        claim={{
          previewToken: claim.previewToken,
          plan: claim.plan,
          businessName: claim.businessName,
          businessType: claim.businessType,
          ownerName: claim.ownerName,
          email: claim.email,
        }}
      />
    );
  }

  const initialPlan = plan && PLAN_NAMES.includes(plan) ? (plan as PlanName) : (claim?.plan ?? null);
  return <RegisterForm initialPlan={initialPlan} />;
}
