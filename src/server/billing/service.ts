import { timingSafeEqual } from "node:crypto";

import { and, desc, eq, sql } from "drizzle-orm";

import {
  billingCustomers,
  billingEvents,
  billingInvoices,
  billingSubscriptions,
  workspaceEntitlements,
  workspaces
} from "../../../db/schema";
import { getCurrentSession } from "../auth/session";
import { requireWorkspaceAccess } from "../auth/workspace";
import { db } from "../db/client";
import {
  assertFeatureAllowed,
  getEntitlementSummary
} from "../entitlements/service";
import { createServerId } from "../ids";
import {
  createBillingEventHash,
  createInvoiceNumber,
  getWebhookPaymentDecision,
  getBillingPeriod,
  mapPaymentStatus,
  parseCheckoutSelection
} from "./core";
import {
  getBillingProvider,
  isBillingProviderConfigured
} from "./providers";
import type { BillingProvider } from "./providers/types";
import type { BillingInvoiceSummary } from "../../types/billing";

export class BillingWebhookAuthorizationError extends Error {
  constructor() {
    super("Webhook de facturation non autorisé.");
    this.name = "BillingWebhookAuthorizationError";
  }
}

function createUniqueInvoiceNumber(): string {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const invoiceNumber = createInvoiceNumber();
    const existing = db
      .select({ id: billingInvoices.id })
      .from(billingInvoices)
      .where(eq(billingInvoices.invoiceNumber, invoiceNumber))
      .limit(1)
      .get();

    if (!existing) {
      return invoiceNumber;
    }
  }

  throw new Error("Impossible de générer un numéro de facture.");
}

function assertWebhookSecret(receivedSecret: string | null): void {
  const configuredSecret = process.env.MOLLIE_WEBHOOK_SECRET;

  if (!configuredSecret || !receivedSecret) {
    throw new BillingWebhookAuthorizationError();
  }

  const received = Buffer.from(receivedSecret);
  const expected = Buffer.from(configuredSecret);

  if (
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  ) {
    throw new BillingWebhookAuthorizationError();
  }
}

function getOrCreateBillingCustomer(input: {
  email: string;
  provider: "mollie";
  workspaceId: string;
}): string {
  const existing = db
    .select({ id: billingCustomers.id })
    .from(billingCustomers)
    .where(
      and(
        eq(billingCustomers.workspaceId, input.workspaceId),
        eq(billingCustomers.provider, input.provider)
      )
    )
    .limit(1)
    .get();

  if (existing) {
    db.update(billingCustomers)
      .set({ email: input.email, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(billingCustomers.id, existing.id))
      .run();
    return existing.id;
  }

  const customerId = createServerId("bcus");
  db.insert(billingCustomers)
    .values({
      email: input.email,
      id: customerId,
      provider: input.provider,
      workspaceId: input.workspaceId
    })
    .run();
  return customerId;
}

export async function startBillingCheckout(input: {
  interval: string;
  planKey: string;
  provider?: BillingProvider;
}): Promise<{ checkoutUrl: string; invoiceId: string }> {
  const access = await requireWorkspaceAccess(["owner", "admin"]);
  assertFeatureAllowed(access.workspaceId, "create_billing_checkout");
  const session = await getCurrentSession();

  if (!session) {
    throw new Error("Session introuvable.");
  }

  const selection = parseCheckoutSelection(input);
  const provider = input.provider ?? getBillingProvider();

  if (provider.key !== "mollie" || !provider.isConfigured()) {
    throw new Error("La facturation Mollie n’est pas configurée.");
  }

  getOrCreateBillingCustomer({
    email: session.email,
    provider: "mollie",
    workspaceId: access.workspaceId
  });

  const invoiceId = createServerId("inv");
  db.insert(billingInvoices)
    .values({
      amountCents: selection.amountCents,
      currency: "EUR",
      id: invoiceId,
      interval: selection.interval,
      invoiceNumber: createUniqueInvoiceNumber(),
      planKey: selection.planKey,
      provider: "mollie",
      status: "pending",
      workspaceId: access.workspaceId
    })
    .run();

  try {
    const checkout = await provider.createCheckoutSession({
      amountCents: selection.amountCents,
      currency: "EUR",
      email: session.email,
      interval: selection.interval,
      invoiceId,
      planKey: selection.planKey,
      workspaceId: access.workspaceId
    });

    db.update(billingInvoices)
      .set({
        providerPaymentId: checkout.providerPaymentId,
        updatedAt: sql`CURRENT_TIMESTAMP`
      })
      .where(
        and(
          eq(billingInvoices.id, invoiceId),
          eq(billingInvoices.workspaceId, access.workspaceId)
        )
      )
      .run();

    return { checkoutUrl: checkout.checkoutUrl, invoiceId };
  } catch (error) {
    db.update(billingInvoices)
      .set({ status: "failed", updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(billingInvoices.id, invoiceId))
      .run();
    throw error;
  }
}

export async function processMollieWebhook(
  request: Request,
  provider: BillingProvider = getBillingProvider()
): Promise<{ status: "ignored" | "processed" }> {
  const url = new URL(request.url);
  assertWebhookSecret(url.searchParams.get("secret"));

  if (provider.key !== "mollie" || !provider.isConfigured()) {
    throw new Error("La facturation Mollie n’est pas configurée.");
  }

  const rawBody = await request.text();
  const notification = provider.parseWebhook(
    rawBody,
    request.headers.get("content-type")
  );
  const payment = await provider.getPaymentStatus(
    notification.providerObjectId
  );
  const payloadHash = createBillingEventHash(rawBody, payment.status);
  const existingEvent = db
    .select({ id: billingEvents.id })
    .from(billingEvents)
    .where(
      and(
        eq(billingEvents.provider, "mollie"),
        eq(billingEvents.payloadHash, payloadHash)
      )
    )
    .limit(1)
    .get();

  if (existingEvent) {
    return { status: "ignored" };
  }

  const eventId = createServerId("bevt");
  db.insert(billingEvents)
    .values({
      eventType: "payment.status",
      id: eventId,
      payloadHash,
      payloadJson: { provider_object_id: notification.providerObjectId },
      processingStatus: "pending",
      provider: "mollie",
      providerEventId: notification.providerEventId
        ? `${notification.providerEventId}:${payment.status}`
        : null,
      providerObjectId: notification.providerObjectId
    })
    .run();

  try {
    const invoice = db
      .select()
      .from(billingInvoices)
      .where(
        and(
          eq(billingInvoices.provider, "mollie"),
          eq(billingInvoices.providerPaymentId, payment.id)
        )
      )
      .limit(1)
      .get();

    if (!invoice) {
      db.update(billingEvents)
        .set({
          processingStatus: "ignored",
          processedAt: sql`CURRENT_TIMESTAMP`
        })
        .where(eq(billingEvents.id, eventId))
        .run();
      return { status: "ignored" };
    }

    const decision = getWebhookPaymentDecision({
      currentInvoiceStatus: invoice.status,
      paymentStatus: payment.status
    });

    if (decision === "ignore") {
      db.update(billingEvents)
        .set({
          processingStatus: "ignored",
          processedAt: sql`CURRENT_TIMESTAMP`,
          workspaceId: invoice.workspaceId
        })
        .where(eq(billingEvents.id, eventId))
        .run();
      return { status: "ignored" };
    }

    const mappedStatus = mapPaymentStatus(payment.status);

    if (decision === "update") {
      db.transaction((tx) => {
        tx.update(billingInvoices)
          .set({
            status: mappedStatus.invoiceStatus,
            updatedAt: sql`CURRENT_TIMESTAMP`
          })
          .where(eq(billingInvoices.id, invoice.id))
          .run();
        tx.update(billingEvents)
          .set({
            processingStatus: "processed",
            processedAt: sql`CURRENT_TIMESTAMP`,
            workspaceId: invoice.workspaceId
          })
          .where(eq(billingEvents.id, eventId))
          .run();
      });
      return { status: "processed" };
    }

    const period = getBillingPeriod({ interval: invoice.interval });
    const subscriptionId = createServerId("sub");

    db.transaction((tx) => {
      tx.insert(billingSubscriptions)
        .values({
          amountCents: invoice.amountCents,
          currency: invoice.currency,
          currentPeriodEnd: period.end,
          currentPeriodStart: period.start,
          id: subscriptionId,
          interval: invoice.interval,
          planKey: invoice.planKey,
          provider: "mollie",
          status: "active",
          workspaceId: invoice.workspaceId
        })
        .run();
      tx.update(billingInvoices)
        .set({
          paidAt: period.start,
          periodEnd: period.end,
          periodStart: period.start,
          status: "paid",
          subscriptionId,
          updatedAt: sql`CURRENT_TIMESTAMP`
        })
        .where(eq(billingInvoices.id, invoice.id))
        .run();

      const entitlement = tx
        .select({ id: workspaceEntitlements.id })
        .from(workspaceEntitlements)
        .where(eq(workspaceEntitlements.workspaceId, invoice.workspaceId))
        .limit(1)
        .get();
      const entitlementValues = {
        currentPeriodEnd: period.end,
        currentPeriodStart: period.start,
        planKey: invoice.planKey,
        source: "billing_provider" as const,
        status: "active" as const,
        updatedAt: sql`CURRENT_TIMESTAMP`
      };

      if (entitlement) {
        tx.update(workspaceEntitlements)
          .set(entitlementValues)
          .where(eq(workspaceEntitlements.id, entitlement.id))
          .run();
      } else {
        tx.insert(workspaceEntitlements)
          .values({
            ...entitlementValues,
            id: createServerId("ent"),
            workspaceId: invoice.workspaceId
          })
          .run();
      }

      tx.update(billingEvents)
        .set({
          processingStatus: "processed",
          processedAt: period.start,
          workspaceId: invoice.workspaceId
        })
        .where(eq(billingEvents.id, eventId))
        .run();
    });

    return { status: "processed" };
  } catch (error) {
    db.update(billingEvents)
      .set({
        errorMessage:
          error instanceof Error ? error.message.slice(0, 240) : "Erreur",
        processingStatus: "failed",
        processedAt: sql`CURRENT_TIMESTAMP`
      })
      .where(eq(billingEvents.id, eventId))
      .run();
    throw error;
  }
}

export async function getAccountBillingData(): Promise<{
  billingConfigured: boolean;
  email: string;
  entitlement: ReturnType<typeof getEntitlementSummary>;
  invoices: BillingInvoiceSummary[];
  workspaceName: string;
}> {
  const access = await requireWorkspaceAccess();
  const session = await getCurrentSession();
  const workspace = db
    .select({ name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.id, access.workspaceId))
    .limit(1)
    .get();
  const invoices = db
    .select({
      amountCents: billingInvoices.amountCents,
      createdAt: billingInvoices.createdAt,
      currency: billingInvoices.currency,
      id: billingInvoices.id,
      invoiceNumber: billingInvoices.invoiceNumber,
      planKey: billingInvoices.planKey,
      status: billingInvoices.status
    })
    .from(billingInvoices)
    .where(eq(billingInvoices.workspaceId, access.workspaceId))
    .orderBy(desc(billingInvoices.createdAt))
    .limit(20)
    .all();

  return {
    billingConfigured: isBillingProviderConfigured(),
    email: session?.email ?? "",
    entitlement: getEntitlementSummary(access.workspaceId),
    invoices,
    workspaceName: workspace?.name ?? "Workspace Fichr"
  };
}
