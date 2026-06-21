import type { ProductFieldKey } from "@/types/import";

export const productAuditStatuses = ["current", "stale"] as const;
export const auditFindingSeverities = ["info", "warning", "blocking"] as const;
export const auditFindingTypes = [
  "missing",
  "recommended_missing",
  "too_long",
  "misplaced",
  "inconsistent",
  "price_risk",
  "technical_required"
] as const;

export type ProductAuditStatus = (typeof productAuditStatuses)[number];
export type AuditFindingSeverity = (typeof auditFindingSeverities)[number];
export type AuditFindingType = (typeof auditFindingTypes)[number];

export type AuditFieldKey = ProductFieldKey | "price" | "technical" | "usage";

export type AuditFinding = {
  id: string;
  severity: AuditFindingSeverity;
  type: AuditFindingType;
  fieldKey: AuditFieldKey;
  message: string;
  recommendation: string;
  requiresClientDecision: boolean;
};

export type ProductAudit = {
  id: string;
  productId: string;
  status: ProductAuditStatus;
  score: number;
  createdAt: string;
  findings: AuditFinding[];
};

export type NewAuditFinding = Omit<AuditFinding, "id">;
