import {
  entitlementStatuses,
  featureKeys,
  planKeys,
  quotaKeys,
  type EntitlementStatus,
  type EntitlementSource,
  type FeatureKey,
  type PlanKey,
  type QuotaKey,
  type ResolvedWorkspaceEntitlements
} from "../../types/entitlement.ts";
import { getFichrPlan } from "./plans.ts";

const activeStatuses = new Set<EntitlementStatus>(["active", "trialing"]);

export function isPlanKey(value: string): value is PlanKey {
  return planKeys.includes(value as PlanKey);
}

export function isEntitlementStatus(
  value: string
): value is EntitlementStatus {
  return entitlementStatuses.includes(value as EntitlementStatus);
}

export function isFeatureKey(value: string): value is FeatureKey {
  return featureKeys.includes(value as FeatureKey);
}

export function isQuotaKey(value: string): value is QuotaKey {
  return quotaKeys.includes(value as QuotaKey);
}

export function resolveEffectivePlanKey(input: {
  currentPeriodEnd?: string | null;
  now?: Date;
  planKey: PlanKey;
  status: EntitlementStatus;
}): PlanKey {
  if (!activeStatuses.has(input.status)) {
    return "demo";
  }

  if (
    input.currentPeriodEnd &&
    new Date(input.currentPeriodEnd).getTime() <=
      (input.now ?? new Date()).getTime()
  ) {
    return "demo";
  }

  return input.planKey;
}

export function resolveWorkspaceEntitlement(input: {
  record?: {
    currentPeriodEnd: string | null;
    currentPeriodStart: string | null;
    planKey: PlanKey;
    source: EntitlementSource;
    status: EntitlementStatus;
  } | null;
  now?: Date;
  workspaceId: string;
}): ResolvedWorkspaceEntitlements {
  if (!input.record) {
    return {
      currentPeriodEnd: null,
      currentPeriodStart: null,
      effectivePlanKey: "demo",
      planKey: "demo",
      source: "system",
      status: "demo",
      workspaceId: input.workspaceId
    };
  }

  const effectivePlanKey = resolveEffectivePlanKey({
    currentPeriodEnd: input.record.currentPeriodEnd,
    now: input.now,
    planKey: input.record.planKey,
    status: input.record.status
  });

  return {
    currentPeriodEnd: input.record.currentPeriodEnd,
    currentPeriodStart: input.record.currentPeriodStart,
    effectivePlanKey,
    planKey: input.record.planKey,
    source: input.record.source,
    status:
      effectivePlanKey === "demo" &&
      (input.record.status === "active" ||
        input.record.status === "trialing")
        ? "expired"
        : input.record.status,
    workspaceId: input.workspaceId
  };
}

export function isFeatureAllowed(
  planKey: PlanKey,
  featureKey: FeatureKey
): boolean {
  return getFichrPlan(planKey).features[featureKey];
}

export function isQuotaAvailable(input: {
  additionalUsage?: number;
  currentUsage: number;
  planKey: PlanKey;
  quotaKey: QuotaKey;
}): boolean {
  const additionalUsage = input.additionalUsage ?? 1;
  return (
    input.currentUsage + additionalUsage <=
    getFichrPlan(input.planKey).quotas[input.quotaKey]
  );
}
