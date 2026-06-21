import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressBar } from "@/components/ui/progress-bar";
import { UiIcon } from "@/components/ui/ui-icon";
import { formatCount } from "@/lib/format-count";
import { getCatalogExportsPageData } from "@/server/exports/service";
import { getCatalogProductsResult } from "@/server/products/queries";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const catalog = await getCatalogProductsResult();
  const exportData = await getCatalogExportsPageData();
  const productCount = catalog.totalCount;
  const validatedProductCount = catalog.statusCounts.validated;
  const productsToAuditCount = productCount - validatedProductCount;
  const validationProgress =
    productCount === 0
      ? 0
      : Math.round((validatedProductCount / productCount) * 100);

  return (
    <AppShell>
      <PageHeader
        actions={
          <>
            <Link className="primary-link" href="/imports">
              <UiIcon name="upload" />
              Importer un CSV
            </Link>
            <Link className="text-link compact-link" href="/catalog">
              Voir le catalogue
              <UiIcon name="arrow-right" />
            </Link>
          </>
        }
        description="Transformez un CSV en fiches produit structurées, prêtes à vérifier."
        eyebrow="Point de départ"
        title="Importer un catalogue"
        titleId="home-title"
      />

      <section className="result-panel" aria-labelledby="home-overview-title">
        <div className="result-header">
          <div>
            <p className="eyebrow">Actions prioritaires</p>
            <h2 id="home-overview-title">État du catalogue</h2>
          </div>
        </div>

        <dl className="metadata-grid home-overview-grid">
          <div>
            <dt>Fiches</dt>
            <dd>{productCount}</dd>
          </div>
          <div>
            <dt>À auditer</dt>
            <dd>{productsToAuditCount}</dd>
          </div>
          <div>
            <dt>Validées</dt>
            <dd>{validatedProductCount}</dd>
          </div>
          <div>
            <dt>Exports récents</dt>
            <dd>{exportData.exports.length}</dd>
          </div>
        </dl>

        <div className="home-progress">
          <ProgressBar
            detail={`${formatCount(validatedProductCount, "validée", "validées")} sur ${formatCount(productCount, "fiche", "fiches")}`}
            label="Avancement du catalogue"
            value={validationProgress}
          />
        </div>

        {productCount === 0 ? (
          <p className="muted-text home-empty-note">
            Commencez par importer un CSV.
          </p>
        ) : null}

      </section>
    </AppShell>
  );
}
