import type { PlanName } from "@prisma/client";

/** Per-plan base commission (USD) for one converted client. Mirrors `CommissionPlan` columns. */
export interface CommissionBases {
  nectar: number;
  honey: number;
  hive: number;
}

/** Default bases — keep in sync with the `CommissionPlan` schema defaults (docs/SALES_REP_PROGRAM.md §3). */
export const DEFAULT_COMMISSION_BASES: CommissionBases = { nectar: 60, honey: 200, hive: 500 };

/** Discount up to this many cents off the setup fee earns full commission (no reduction). */
export const FREE_DISCOUNT_ALLOWANCE_CENTS = 5000; // $50

/** Commission is never reduced below this fraction of the plan base, however deep the discount. */
export const MIN_BASE_FRACTION = 0.5;

function baseFor(plan: PlanName, bases: CommissionBases): number {
  switch (plan) {
    case "NECTAR":
      return bases.nectar;
    case "HONEY":
      return bases.honey;
    case "HIVE":
      return bases.hive;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface CommissionResult {
  base: number; // plan base before any discount coupling (USD)
  amount: number; // commission actually earned (USD)
  discountCents: number; // setup-fee discount granted
  reducedFraction: number; // 0 = full base, up to 0.5 = floored
}

/**
 * Compute a rep's commission for one converted client, applying the discount-coupling rule from
 * docs/SALES_REP_PROGRAM.md §3: a setup-fee discount within the $50 allowance earns the full plan
 * base; deeper discounts reduce the base by the same *percentage* as the setup-fee discount, floored
 * at 50% of base. The discount ratio is unitless (cents/cents), so no currency float drift.
 */
export function computeCommission(args: {
  plan: PlanName;
  bases?: CommissionBases;
  listedSetupFeeCents: number;
  collectedSetupFeeCents: number;
}): CommissionResult {
  const bases = args.bases ?? DEFAULT_COMMISSION_BASES;
  const base = baseFor(args.plan, bases);
  const discountCents = Math.max(0, args.listedSetupFeeCents - args.collectedSetupFeeCents);

  if (discountCents <= FREE_DISCOUNT_ALLOWANCE_CENTS || args.listedSetupFeeCents <= 0) {
    return { base, amount: round2(base), discountCents, reducedFraction: 0 };
  }

  const discountPct = discountCents / args.listedSetupFeeCents; // 0..1
  const keptFraction = Math.max(MIN_BASE_FRACTION, 1 - discountPct);
  return {
    base,
    amount: round2(base * keptFraction),
    discountCents,
    reducedFraction: round2(1 - keptFraction),
  };
}
