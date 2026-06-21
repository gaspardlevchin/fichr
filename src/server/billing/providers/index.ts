import { createMollieBillingProvider } from "./mollie";
import type { BillingProvider } from "./types";

export function getBillingProvider(): BillingProvider {
  const provider = process.env.BILLING_PROVIDER ?? "mollie";

  if (provider !== "mollie") {
    throw new Error("Provider de facturation non pris en charge.");
  }

  return createMollieBillingProvider();
}

export function isBillingProviderConfigured(): boolean {
  try {
    return getBillingProvider().isConfigured();
  } catch {
    return false;
  }
}
