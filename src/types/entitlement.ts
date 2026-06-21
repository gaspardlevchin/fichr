export const planKeys = [
  "demo",
  "starter",
  "studio",
  "pro",
  "business"
] as const;

export const entitlementStatuses = [
  "demo",
  "trialing",
  "active",
  "pending_payment",
  "overdue",
  "canceled",
  "expired",
  "suspended"
] as const;

export const entitlementSources = [
  "system",
  "manual",
  "beta",
  "billing_provider"
] as const;

export const featureKeys = [
  "create_product",
  "import_csv",
  "create_space",
  "upload_product_image",
  "export_pdf",
  "export_csv",
  "export_txt",
  "secure_export_identity",
  "ai_suggestions",
  "create_billing_checkout",
  "receive_billing_webhook"
] as const;

export const quotaKeys = [
  "maxProducts",
  "maxSpaces",
  "maxImports",
  "maxExports",
  "maxImages"
] as const;

export type PlanKey = (typeof planKeys)[number];
export type EntitlementStatus = (typeof entitlementStatuses)[number];
export type EntitlementSource = (typeof entitlementSources)[number];
export type FeatureKey = (typeof featureKeys)[number];
export type QuotaKey = (typeof quotaKeys)[number];

export type WorkspaceEntitlementMetadata = Record<
  string,
  string | number | boolean | null
>;

export type ResolvedWorkspaceEntitlements = {
  currentPeriodEnd: string | null;
  currentPeriodStart: string | null;
  effectivePlanKey: PlanKey;
  planKey: PlanKey;
  source: EntitlementSource;
  status: EntitlementStatus;
  workspaceId: string;
};
