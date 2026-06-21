import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { InlineAlert } from "@/components/ui/inline-alert";
import { PageHeader } from "@/components/ui/page-header";
import { UiIcon } from "@/components/ui/ui-icon";
import { startBillingCheckoutAction } from "@/server/billing/actions";
import { isBillingProviderConfigured } from "@/server/billing/providers";
import { fichrPlans } from "@/server/entitlements/plans";
import type { PlanKey } from "@/types/entitlement";

export const dynamic = "force-dynamic";

type BillingPlansPageProps = {
  searchParams: Promise<{ error?: string }>;
};

function formatPrice(amountCents: number): string {
  return new Intl.NumberFormat("fr-FR", {
    currency: "EUR",
    style: "currency"
  }).format(amountCents / 100);
}

export default async function BillingPlansPage({
  searchParams
}: BillingPlansPageProps) {
  const { error } = await searchParams;
  const billingConfigured = isBillingProviderConfigured();
  const planOrder: PlanKey[] = [
    "demo",
    "starter",
    "studio",
    "pro",
    "business"
  ];

  return (
    <AppShell>
      <PageHeader
        back={
          <Link className="back-link" href="/account">
            <UiIcon name="arrow-left" />
            Retour au compte
          </Link>
        }
        description="Comparez les capacités disponibles et choisissez le plan adapté à votre catalogue."
        eyebrow="Compte"
        title="Plans"
        titleId="plans-title"
      />

      {error ? <InlineAlert variant="error">{error}</InlineAlert> : null}
      {!billingConfigured ? (
        <InlineAlert>
          L’activation en ligne n’est pas encore disponible.
        </InlineAlert>
      ) : null}

      <section className="settings-grid" aria-label="Plans Fichr">
        {planOrder.map((planKey) => {
          const plan = fichrPlans[planKey];

          return (
            <article
              className="result-panel content-card settings-panel"
              key={plan.key}
            >
              <div className="content-card-inner plan-card-inner">
                <p className="eyebrow">Plan</p>
                <h2>{plan.label}</h2>
                <ul className="plan-capabilities">
                  <li>Jusqu’à {plan.quotas.maxProducts} produits</li>
                  <li>Jusqu’à {plan.quotas.maxSpaces} espaces</li>
                  <li>{plan.quotas.maxImports} imports</li>
                  <li>{plan.quotas.maxExports} exports</li>
                  <li>
                    PDF {plan.features.export_pdf ? "inclus" : "non inclus"}
                  </li>
                </ul>
                <p>
                  {plan.key === "demo"
                    ? "Gratuit"
                    : `${formatPrice(plan.prices.month)} / mois`}
                </p>
                {plan.key !== "demo" && billingConfigured ? (
                  <form action={startBillingCheckoutAction}>
                    <input name="planKey" type="hidden" value={plan.key} />
                    <input name="interval" type="hidden" value="month" />
                    <button className="primary-button" type="submit">
                      Activer ce plan
                    </button>
                  </form>
                ) : null}
              </div>
            </article>
          );
        })}
      </section>
    </AppShell>
  );
}
