"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  getCatalogProductActionHref,
  getProductStatusLabel
} from "@/lib/product-completeness";
import { getDeletedProductStatusLabel } from "@/lib/product-status";
import { ProgressBar } from "@/components/ui/progress-bar";
import { UiIcon, type UiIconName } from "@/components/ui/ui-icon";
import { formatCount } from "@/lib/format-count";
import { createCatalogExportAction } from "@/server/exports/actions";
import type { CatalogProductListItem } from "@/server/products/catalog-filters";

type CatalogBulkExportFormProps = {
  products: CatalogProductListItem[];
};

function formatPrice(value: number | null): string {
  return value === null ? "-" : `${value.toFixed(2)} EUR`;
}

function ProductThumb({ product }: { product: CatalogProductListItem }) {
  if (product.imageUrl) {
    return (
      <div
        aria-label="Image produit"
        className="product-thumb"
        style={{ backgroundImage: `url(${product.imageUrl})` }}
      />
    );
  }

  return (
    <div className="product-thumb product-thumb-empty">
      <span>Aucune image</span>
    </div>
  );
}

function getCatalogOpenActionLabel(product: CatalogProductListItem): string {
  if (product.deletedAt) {
    return "Ouvrir pour restaurer";
  }

  if (product.status === "validated") {
    return "Voir la fiche";
  }

  if (product.completenessIndicator === "blocked") {
    return "Ouvrir pour corriger";
  }

  if (product.completenessIndicator === "incomplete") {
    return "Compléter";
  }

  if (
    product.completenessIndicator === "ready" ||
    product.completenessIndicator === "complete"
  ) {
    return "Vérifier avant validation";
  }

  return "Ouvrir";
}

function getStatusIcon(product: CatalogProductListItem): UiIconName {
  if (product.deletedAt) {
    return "trash";
  }

  if (product.status === "validated") {
    return "circle-check";
  }

  if (product.status === "needs_info" || product.status === "needs_review") {
    return "alert";
  }

  return "clock";
}

export function CatalogBulkExportForm({
  products
}: CatalogBulkExportFormProps) {
  const validProductIds = useMemo(
    () =>
      products
        .filter((product) => !product.deletedAt && product.status === "validated")
        .map((product) => product.id),
    [products]
  );
  const masterCheckboxRef = useRef<HTMLInputElement>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const selectedProductIdSet = new Set(selectedProductIds);
  const hasValidProducts = validProductIds.length > 0;
  const hasSelection = selectedProductIds.length > 0;
  const allValidSelected =
    hasValidProducts && selectedProductIds.length === validProductIds.length;

  useEffect(() => {
    if (masterCheckboxRef.current) {
      masterCheckboxRef.current.indeterminate =
        hasSelection && !allValidSelected;
    }
  }, [allValidSelected, hasSelection]);

  function togglePageSelection(checked: boolean) {
    setSelectedProductIds(checked ? validProductIds : []);
  }

  function toggleProductSelection(productId: string, checked: boolean) {
    setSelectedProductIds((currentSelection) => {
      if (checked) {
        return Array.from(new Set([...currentSelection, productId]));
      }

      return currentSelection.filter((selectedId) => selectedId !== productId);
    });
  }

  return (
    <form action={createCatalogExportAction} className="catalog-bulk-form">
      <input name="exportMode" type="hidden" value="selected" />

      <section
        className="result-panel catalog-selection-panel"
        aria-labelledby="catalog-selection-title"
      >
        <div className="result-header">
          <div>
            <p className="eyebrow">Sélection</p>
            <h2 id="catalog-selection-title">Export catalogue</h2>
          </div>
          <span className="status-pill">
            {formatCount(validProductIds.length, "validé", "validés")} sur
            cette page
          </span>
        </div>

        <p className="muted-text">
          Seules les fiches validées peuvent être sélectionnées et exportées.
        </p>

        <div className="catalog-selection-toolbar">
          <label className="catalog-checkbox-label">
            <input
              checked={allValidSelected}
              className="native-checkbox"
              disabled={!hasValidProducts}
              onChange={(event) => togglePageSelection(event.target.checked)}
              ref={masterCheckboxRef}
              type="checkbox"
            />
            <span>Sélectionner les produits validés de cette page</span>
          </label>

          <div className="inline-actions catalog-export-actions">
            <button
              className="primary-button"
              disabled={!hasSelection}
              name="exportType"
              type="submit"
              value="text"
            >
              <UiIcon name="download" />
              Exporter en TXT
            </button>
            <button
              className="primary-button"
              disabled={!hasSelection}
              name="exportType"
              type="submit"
              value="csv"
            >
              <UiIcon name="download" />
              Exporter en CSV
            </button>
            <button
              className="primary-button"
              disabled={!hasSelection}
              name="exportType"
              type="submit"
              value="pdf"
            >
              <UiIcon name="download" />
              Exporter en PDF
            </button>
          </div>
        </div>
      </section>

      <section className="product-grid" aria-label="Produits catalogue">
        {products.map((product) => {
          const isExportable =
            !product.deletedAt && product.status === "validated";
          const isSelected = selectedProductIdSet.has(product.id);

          return (
            <article className="product-card catalog-product-card" key={product.id}>
              <ProductThumb product={product} />
              <div className="product-card-body">
                <div className="result-header">
                  <div>
                    <p className="eyebrow">
                      {product.category ?? "Sans catégorie"}
                    </p>
                    <h2>{product.title}</h2>
                  </div>
                  <div className="catalog-status-pills">
                    {product.deletedAt ? (
                      <span className="status-pill status-deleted">
                        <UiIcon name="trash" size={14} />
                        {getDeletedProductStatusLabel()}
                      </span>
                    ) : null}
                    <span className={`status-pill status-${product.status}`}>
                      <UiIcon name={getStatusIcon(product)} size={14} />
                      {getProductStatusLabel(product.status)}
                    </span>
                    {product.potentialDuplicate ? (
                      <span className="status-pill status-warning">
                        <UiIcon name="alert" size={14} />
                        Doublon potentiel
                      </span>
                    ) : null}
                  </div>
                </div>

                <dl className="product-facts">
                  <div>
                    <dt>Prix actuel</dt>
                    <dd>{formatPrice(product.currentPrice)}</dd>
                  </div>
                  <div>
                    <dt>Prix souhaité</dt>
                    <dd>{formatPrice(product.desiredPrice)}</dd>
                  </div>
                  <div>
                    <dt>Espace</dt>
                    <dd>
                      {product.spaceName ?? "Sans espace"}
                      {product.spaceArchivedAt ? " · Espace archivé" : ""}
                    </dd>
                  </div>
                </dl>

                <div className="product-progress">
                  <ProgressBar
                    label="Complétude"
                    value={product.completeness.completenessScore}
                  />
                </div>

                <div className="catalog-card-actions">
                  {isExportable ? (
                    <label className="catalog-checkbox-label">
                      <input
                        checked={isSelected}
                        className="native-checkbox"
                        name="productIds"
                        onChange={(event) =>
                          toggleProductSelection(product.id, event.target.checked)
                        }
                        type="checkbox"
                        value={product.id}
                      />
                      <span>Sélectionner pour export</span>
                    </label>
                  ) : (
                    <span className="muted-state">
                      {product.deletedAt
                        ? "Fiche masquée · export bloqué"
                        : "À valider avant export"}
                    </span>
                  )}
                  <Link
                    className="product-open-action"
                    href={getCatalogProductActionHref(product)}
                  >
                    {getCatalogOpenActionLabel(product)}
                    <UiIcon name="arrow-right" />
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </form>
  );
}
