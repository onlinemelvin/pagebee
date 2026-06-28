import type { PlanName } from "@prisma/client";

/** A rep's promotional monthly discount runs for the first year, then reverts to the agreed rate. */
export const MONTHLY_PROMO_MONTHS = 12;

/** Rep setup-fee floors (cents) — discounts to here need no approval. From FEATURE_FLAGS.md. */
export const REP_SETUP_FLOOR_CENTS: Record<PlanName, number> = {
  NECTAR: 29900,
  HONEY: 59900,
  HIVE: 89900,
};

export interface GuardrailInput {
  plan: PlanName;
  listedSetupCents: number;
  listedMonthlyCents: number;
  offeredSetupCents: number;
  offeredMonthlyCents: number;
}

export interface GuardrailResult {
  requiresApproval: boolean;
  reasons: string[]; // machine-readable: "monthly_discount" | "setup_below_floor" | "setup_waived" | "multiple_discounts"
  floorCents: number;
  setupDiscountCents: number;
  monthlyDiscountCents: number;
}

/**
 * Evaluate a rep's offered pricing against the discount guardrails (docs/SALES_REP_PROGRAM.md §5):
 * reps may discount the setup fee down to the plan floor freely; ANY monthly discount, setup below
 * the floor, a waived setup, or more than one discount requires admin approval. Pure + deterministic
 * so the same rule drives quote creation and tests.
 */
export function evaluateGuardrails(input: GuardrailInput): GuardrailResult {
  const floorCents = REP_SETUP_FLOOR_CENTS[input.plan];
  const setupDiscountCents = Math.max(0, input.listedSetupCents - input.offeredSetupCents);
  const monthlyDiscountCents = Math.max(0, input.listedMonthlyCents - input.offeredMonthlyCents);

  const reasons: string[] = [];
  const monthlyDiscount = monthlyDiscountCents > 0;
  const setupDiscount = setupDiscountCents > 0;
  if (monthlyDiscount) reasons.push("monthly_discount");
  if (input.offeredSetupCents <= 0) reasons.push("setup_waived");
  else if (input.offeredSetupCents < floorCents) reasons.push("setup_below_floor");
  if (monthlyDiscount && setupDiscount) reasons.push("multiple_discounts");

  return {
    requiresApproval: reasons.length > 0,
    reasons,
    floorCents,
    setupDiscountCents,
    monthlyDiscountCents,
  };
}
