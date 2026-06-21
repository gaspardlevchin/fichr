import {
  and,
  count,
  eq,
  isNotNull,
  isNull,
  ne,
  sql
} from "drizzle-orm";

import {
  catalogExports,
  imports,
  products,
  spaces,
  workspaceEntitlements
} from "../../../db/schema";
import { db } from "../db/client";
import { createServerId } from "../ids";
import {
  isFeatureAllowed,
  isQuotaAvailable,
  resolveWorkspaceEntitlement
} from "./core";
import { getFichrPlan } from "./plans";
import type {
  EntitlementSource,
  EntitlementStatus,
  FeatureKey,
  PlanKey,
  QuotaKey,
  ResolvedWorkspaceEntitlements,
  WorkspaceEntitlementMetadata
} from "../../types/entitlement";

export class EntitlementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EntitlementError";
  }
}

export type WorkspaceUsage = Record<QuotaKey, number>;

export function getWorkspaceEntitlements(
  workspaceId: string
): ResolvedWorkspaceEntitlements {
  const entitlement = db
    .select()
    .from(workspaceEntitlements)
    .where(eq(workspaceEntitlements.workspaceId, workspaceId))
    .limit(1)
    .get();

  return resolveWorkspaceEntitlement({ record: entitlement, workspaceId });
}

export function getWorkspaceUsage(workspaceId: string): WorkspaceUsage {
  const productCount = db
    .select({ value: count(products.id) })
    .from(products)
    .where(
      and(eq(products.workspaceId, workspaceId), isNull(products.deletedAt))
    )
    .get()?.value ?? 0;
  const spaceCount = db
    .select({ value: count(spaces.id) })
    .from(spaces)
    .where(and(eq(spaces.workspaceId, workspaceId), isNull(spaces.deletedAt)))
    .get()?.value ?? 0;
  const importCount = db
    .select({ value: count(imports.id) })
    .from(imports)
    .where(eq(imports.workspaceId, workspaceId))
    .get()?.value ?? 0;
  const exportCount = db
    .select({ value: count(catalogExports.id) })
    .from(catalogExports)
    .where(
      and(
        eq(catalogExports.workspaceId, workspaceId),
        ne(catalogExports.status, "deleted")
      )
    )
    .get()?.value ?? 0;
  const imageCount = db
    .select({ value: count(products.id) })
    .from(products)
    .where(
      and(
        eq(products.workspaceId, workspaceId),
        isNull(products.deletedAt),
        isNotNull(products.imageUrl)
      )
    )
    .get()?.value ?? 0;

  return {
    maxExports: exportCount,
    maxImages: imageCount,
    maxImports: importCount,
    maxProducts: productCount,
    maxSpaces: spaceCount
  };
}

function getFeatureErrorMessage(
  entitlement: ResolvedWorkspaceEntitlements,
  featureKey: FeatureKey
): string {
  if (featureKey === "export_pdf") {
    return "L’export PDF nécessite un plan actif.";
  }

  if (entitlement.effectivePlanKey === "demo") {
    return "Votre espace est en mode démo.";
  }

  return "Cette fonctionnalité n’est pas disponible avec votre plan actuel.";
}

export function assertFeatureAllowed(
  workspaceId: string,
  featureKey: FeatureKey
): ResolvedWorkspaceEntitlements {
  const entitlement = getWorkspaceEntitlements(workspaceId);

  if (!isFeatureAllowed(entitlement.effectivePlanKey, featureKey)) {
    throw new EntitlementError(getFeatureErrorMessage(entitlement, featureKey));
  }

  return entitlement;
}

export function assertQuotaAvailable(
  workspaceId: string,
  quotaKey: QuotaKey,
  additionalUsage = 1
): ResolvedWorkspaceEntitlements {
  const entitlement = getWorkspaceEntitlements(workspaceId);
  const usage = getWorkspaceUsage(workspaceId)[quotaKey];

  if (
    !isQuotaAvailable({
      additionalUsage,
      currentUsage: usage,
      planKey: entitlement.effectivePlanKey,
      quotaKey
    })
  ) {
    throw new EntitlementError("Limite atteinte pour ce plan.");
  }

  return entitlement;
}

export function setWorkspaceEntitlement(input: {
  currentPeriodEnd?: string | null;
  currentPeriodStart?: string | null;
  metadata?: WorkspaceEntitlementMetadata | null;
  planKey: PlanKey;
  source: EntitlementSource;
  status: EntitlementStatus;
  workspaceId: string;
}): void {
  const existing = db
    .select({ id: workspaceEntitlements.id })
    .from(workspaceEntitlements)
    .where(eq(workspaceEntitlements.workspaceId, input.workspaceId))
    .limit(1)
    .get();
  const values = {
    currentPeriodEnd: input.currentPeriodEnd ?? null,
    currentPeriodStart: input.currentPeriodStart ?? null,
    metadata: input.metadata ?? null,
    planKey: input.planKey,
    source: input.source,
    status: input.status,
    updatedAt: sql`CURRENT_TIMESTAMP`
  };

  if (existing) {
    db.update(workspaceEntitlements)
      .set(values)
      .where(eq(workspaceEntitlements.id, existing.id))
      .run();
    return;
  }

  db.insert(workspaceEntitlements)
    .values({
      ...values,
      id: createServerId("ent"),
      workspaceId: input.workspaceId
    })
    .run();
}

export function getEntitlementSummary(workspaceId: string) {
  const entitlement = getWorkspaceEntitlements(workspaceId);
  return {
    entitlement,
    plan: getFichrPlan(entitlement.effectivePlanKey),
    usage: getWorkspaceUsage(workspaceId)
  };
}
