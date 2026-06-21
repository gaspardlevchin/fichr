import type { PlanKey } from "./entitlement";

export const billingProviders = ["mollie", "manual", "future_provider"] as const;
export const billingIntervals = ["month", "year"] as const;
export const billingSubscriptionStatuses = [
  "pending",
  "active",
  "trialing",
  "past_due",
  "canceled",
  "expired",
  "suspended"
] as const;
export const billingInvoiceStatuses = [
  "draft",
  "pending",
  "paid",
  "failed",
  "overdue",
  "canceled",
  "refunded"
] as const;
export const billingEventStatuses = [
  "pending",
  "processed",
  "ignored",
  "failed"
] as const;

export type BillingProviderKey = (typeof billingProviders)[number];
export type BillingInterval = (typeof billingIntervals)[number];
export type BillingSubscriptionStatus =
  (typeof billingSubscriptionStatuses)[number];
export type BillingInvoiceStatus = (typeof billingInvoiceStatuses)[number];
export type BillingEventStatus = (typeof billingEventStatuses)[number];
export type BillingMetadata = Record<
  string,
  string | number | boolean | null
>;

export type BillingInvoiceSummary = {
  amountCents: number;
  createdAt: string;
  currency: string;
  id: string;
  invoiceNumber: string;
  planKey: PlanKey;
  status: BillingInvoiceStatus;
};
