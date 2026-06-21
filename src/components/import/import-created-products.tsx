import Link from "next/link";

import { UiIcon } from "@/components/ui/ui-icon";
import { formatCount } from "@/lib/format-count";
import {
  getProductCompletenessIndicatorLabel,
  getProductStatusLabel
} from "@/lib/product-completeness";
import type { ImportedProductBatchPreview } from "@/server/products/queries";

export function ImportCreatedProducts({
  batch,
  importId
}: {
  batch: ImportedProductBatchPreview;
  importId: string;
}) {
  if (batch.summary.productCount === 0) {
    return null;
  }

  return (
    <section
      className="result-panel import-created-products"
      aria-labelledby="import-created-products-title"
    >
      <div className="result-header">
        <div>
          <p className="eyebrow">Produits créés</p>
          <h2 id="import-created-products-title">
            {formatCount(
              batch.summary.productCount,
              "fiche issue",
              "fiches issues"
            )}{" "}
            de cet import
          </h2>
        </div>
        <Link
          className="primary-link compact-link"
          href={`/catalog?import=${encodeURIComponent(importId)}`}
        >
          Voir les produits créés
          <UiIcon name="arrow-right" />
        </Link>
      </div>

      <div className="import-created-products-list">
        {batch.products.map((product) => (
          <article className="import-created-product-row" key={product.id}>
            <div>
              <h3>{product.title}</h3>
              <p className="muted-text">
                {getProductStatusLabel(product.status)} ·{" "}
                {getProductCompletenessIndicatorLabel(
                  product.completenessIndicator
                )}{" "}
                · {product.spaceName ?? "Sans espace"}
              </p>
            </div>
            <Link
              className="text-link compact-link"
              href={`/products/${encodeURIComponent(product.id)}`}
            >
              Ouvrir
              <UiIcon name="arrow-right" />
            </Link>
          </article>
        ))}
      </div>

      {batch.summary.productCount > batch.products.length ? (
        <p className="muted-text">
          Aperçu limité à {batch.products.length} fiches. Ouvrez le lot pour
          traiter l’ensemble.
        </p>
      ) : null}
    </section>
  );
}
