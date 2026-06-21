import type {
  BillingInterval,
  BillingProviderKey
} from "../../../types/billing";
import type { PlanKey } from "../../../types/entitlement";
import type { ProviderPaymentStatus } from "../core";

export type CreateCheckoutSessionInput = {
  amountCents: number;
  currency: "EUR";
  email: string;
  interval: BillingInterval;
  invoiceId: string;
  planKey: Exclude<PlanKey, "demo">;
  workspaceId: string;
};

export type CreateCheckoutSessionResult = {
  checkoutUrl: string;
  providerPaymentId: string;
  status: ProviderPaymentStatus;
};

export type ProviderPayment = {
  id: string;
  status: ProviderPaymentStatus;
};

export type BillingWebhookNotification = {
  providerEventId: string | null;
  providerObjectId: string;
};

export interface BillingProvider {
  createCheckoutSession(
    input: CreateCheckoutSessionInput
  ): Promise<CreateCheckoutSessionResult>;
  getPaymentStatus(providerPaymentId: string): Promise<ProviderPayment>;
  isConfigured(): boolean;
  key: BillingProviderKey;
  parseWebhook(rawBody: string, contentType: string | null): BillingWebhookNotification;
}
