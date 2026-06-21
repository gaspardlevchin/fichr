import type { ProviderPaymentStatus } from "../core";
import type {
  BillingProvider,
  BillingWebhookNotification,
  CreateCheckoutSessionInput,
  CreateCheckoutSessionResult,
  ProviderPayment
} from "./types";

type MollieConfiguration = {
  apiKey?: string;
  appUrl?: string;
  profileId?: string;
  returnUrl?: string;
  webhookSecret?: string;
};

type FetchImplementation = typeof fetch;

function normalizeProviderStatus(status: string): ProviderPaymentStatus {
  if (status === "paid") {
    return "paid";
  }

  if (status === "failed") {
    return "failed";
  }

  if (status === "canceled") {
    return "canceled";
  }

  if (status === "expired") {
    return "expired";
  }

  return "pending";
}

function getMollieConfiguration(): MollieConfiguration {
  return {
    apiKey: process.env.MOLLIE_API_KEY,
    appUrl: process.env.FICHR_APP_URL,
    profileId: process.env.MOLLIE_PROFILE_ID,
    returnUrl: process.env.FICHR_BILLING_RETURN_URL,
    webhookSecret: process.env.MOLLIE_WEBHOOK_SECRET
  };
}

function assertConfigured(
  configuration: MollieConfiguration
): Required<MollieConfiguration> {
  if (
    !configuration.apiKey ||
    !configuration.appUrl ||
    !configuration.profileId ||
    !configuration.returnUrl ||
    !configuration.webhookSecret
  ) {
    throw new Error("La facturation Mollie n’est pas configurée.");
  }

  return configuration as Required<MollieConfiguration>;
}

async function readMollieResponse(response: Response): Promise<Record<string, unknown>> {
  const payload = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    throw new Error("Mollie a refusé la requête de facturation.");
  }

  return payload;
}

export function createMollieBillingProvider(
  configuration: MollieConfiguration = getMollieConfiguration(),
  fetchImplementation: FetchImplementation = fetch
): BillingProvider {
  return {
    key: "mollie",
    isConfigured() {
      return Boolean(
        configuration.apiKey &&
          configuration.appUrl &&
          configuration.profileId &&
          configuration.returnUrl &&
          configuration.webhookSecret
      );
    },
    async createCheckoutSession(
      input: CreateCheckoutSessionInput
    ): Promise<CreateCheckoutSessionResult> {
      const config = assertConfigured(configuration);
      const webhookUrl = new URL("/api/billing/mollie/webhook", config.appUrl);
      webhookUrl.searchParams.set("secret", config.webhookSecret);
      const response = await fetchImplementation(
        "https://api.mollie.com/v2/payments",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            amount: {
              currency: input.currency,
              value: (input.amountCents / 100).toFixed(2)
            },
            description: `Fichr ${input.planKey} ${input.interval}`,
            profileId: config.profileId,
            redirectUrl: config.returnUrl,
            webhookUrl: webhookUrl.toString(),
            metadata: {
              invoice_id: input.invoiceId,
              workspace_id: input.workspaceId,
              plan_key: input.planKey,
              interval: input.interval
            }
          })
        }
      );
      const payload = await readMollieResponse(response);
      const links = payload._links as
        | { checkout?: { href?: string } }
        | undefined;
      const providerPaymentId =
        typeof payload.id === "string" ? payload.id : null;
      const checkoutUrl = links?.checkout?.href;

      if (!providerPaymentId || !checkoutUrl) {
        throw new Error("Mollie n’a pas retourné de session de paiement valide.");
      }

      return {
        checkoutUrl,
        providerPaymentId,
        status: normalizeProviderStatus(String(payload.status ?? "pending"))
      };
    },
    async getPaymentStatus(providerPaymentId: string): Promise<ProviderPayment> {
      const config = assertConfigured(configuration);
      const response = await fetchImplementation(
        `https://api.mollie.com/v2/payments/${encodeURIComponent(providerPaymentId)}`,
        {
          headers: {
            Authorization: `Bearer ${config.apiKey}`
          }
        }
      );
      const payload = await readMollieResponse(response);

      return {
        id: String(payload.id ?? providerPaymentId),
        status: normalizeProviderStatus(String(payload.status ?? "pending"))
      };
    },
    parseWebhook(
      rawBody: string,
      contentType: string | null
    ): BillingWebhookNotification {
      let providerObjectId = "";

      if (contentType?.includes("application/json")) {
        const payload = JSON.parse(rawBody) as { id?: unknown };
        providerObjectId =
          typeof payload.id === "string" ? payload.id.trim() : "";
      } else {
        providerObjectId = new URLSearchParams(rawBody).get("id")?.trim() ?? "";
      }

      if (!providerObjectId) {
        throw new Error("Notification Mollie invalide.");
      }

      return {
        providerEventId: providerObjectId,
        providerObjectId
      };
    }
  };
}
