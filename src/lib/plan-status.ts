import type {
  BillingInvoiceStatus
} from "../types/billing.ts";
import type { EntitlementStatus } from "../types/entitlement.ts";

const planStatusLabels: Record<EntitlementStatus, string> = {
  active: "Actif",
  canceled: "Annulé",
  demo: "Démo",
  expired: "Expiré",
  overdue: "Paiement en retard",
  pending_payment: "Paiement en attente",
  suspended: "Suspendu",
  trialing: "Essai"
};

const invoiceStatusLabels: Record<BillingInvoiceStatus, string> = {
  canceled: "Annulée",
  draft: "Brouillon",
  failed: "Erreur",
  overdue: "En retard",
  paid: "Payée",
  pending: "Paiement en attente",
  refunded: "Remboursée"
};

export function getPlanStatusLabel(status: EntitlementStatus): string {
  return planStatusLabels[status];
}

export function getInvoiceStatusLabel(
  status: BillingInvoiceStatus
): string {
  return invoiceStatusLabels[status];
}
