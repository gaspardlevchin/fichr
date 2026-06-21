import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { CatalogBulkExportForm } from "@/components/catalog/catalog-bulk-export-form";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineAlert } from "@/components/ui/inline-alert";
import { PageHeader } from "@/components/ui/page-header";
import { UiIcon } from "@/components/ui/ui-icon";
import { formatCount } from "@/lib/format-count";
import { getProductAuditStateLabel } from "@/lib/product-status";
import {
  auditImportedProductBatchAction,
  restoreImportedProductBatchAction,
  softDeleteImportedProductBatchAction
} from "@/server/products/import-batch-actions";
import {
  getCatalogProductsResult,
  type CatalogProductsResult
} from "@/server/products/queries";
import type {
  CatalogCompletenessFilter,
  CatalogAuditFilter,
  CatalogSort,
  CatalogStatusFilter
} from "@/server/products/catalog-filters";
import { getCatalogHref } from "@/server/products/catalog-filters";

export const dynamic = "force-dynamic";

type CatalogPageProps = {
  searchParams?: Promise<{
    audit?: string;
    batch_audited?: string;
    batch_audit_skipped?: string;
    batch_deleted?: string;
    batch_delete_skipped?: string;
    batch_error?: string;
    batch_restored?: string;
    batch_restore_skipped?: string;
    deleted?: string;
    import?: string;
    page?: string;
    pageSize?: string;
    q?: string;
    sort?: string;
    status?: string;
    completeness?: string;
    soft_deleted?: string;
    space?: string;
  }>;
};

const statusOptions: Array<{
  label: string;
  value: CatalogStatusFilter;
}> = [
  { label: "Tous", value: "all" },
  { label: "Brouillons", value: "draft" },
  { label: "À compléter", value: "needs_info" },
  { label: "À revoir", value: "needs_review" },
  { label: "Validés", value: "validated" }
];

const sortOptions: Array<{
  label: string;
  value: CatalogSort;
}> = [
  { label: "Plus ancien", value: "oldest" },
  { label: "Plus récent", value: "newest" },
  { label: "Titre A-Z", value: "title_asc" },
  { label: "Titre Z-A", value: "title_desc" },
  { label: "Statut", value: "status" },
  { label: "Complétude basse", value: "completeness_asc" },
  { label: "Complétude haute", value: "completeness_desc" }
];

const completenessOptions: Array<{
  label: string;
  value: CatalogCompletenessFilter;
}> = [
  { label: "Toutes", value: "all" },
  { label: "Bloquantes", value: "blocked" },
  { label: "À compléter", value: "incomplete" },
  { label: "Prêtes", value: "ready" },
  { label: "Complètes", value: "complete" }
];

const pageSizeOptions = [25, 50, 100] as const;

function getQueryCount(value: string | undefined): number {
  const count = Number.parseInt(value ?? "0", 10);

  return Number.isFinite(count) && count > 0 ? count : 0;
}

function getStatusLabel(status: CatalogStatusFilter): string {
  return statusOptions.find((option) => option.value === status)?.label ?? status;
}

function getCompletenessLabel(completeness: CatalogCompletenessFilter): string {
  return (
    completenessOptions.find((option) => option.value === completeness)?.label ??
    completeness
  );
}

function getAuditLabel(audit: CatalogAuditFilter): string {
  return audit === "all" ? "Tous les audits" : getProductAuditStateLabel(audit);
}

function CatalogSummary({ data }: { data: CatalogProductsResult }) {
  const summaryItems = [
    {
      label: data.filters.deleted === "deleted" ? "Masquées" : "Produits",
      value: data.totalCount
    },
    { label: "Brouillons", value: data.statusCounts.draft },
    { label: "À compléter", value: data.statusCounts.needs_info },
    { label: "Prêtes", value: data.completenessCounts.ready },
    { label: "Validées", value: data.statusCounts.validated },
    { label: "Doublons", value: data.potentialDuplicateCount }
  ];

  return (
    <section
      className="content-card catalog-metrics"
      aria-label="Résumé du catalogue"
    >
      <div className="content-card-inner">
        <div className="catalog-metrics-grid">
          {summaryItems.map((item) => (
            <article
              className={`catalog-metric ${
                item.label === "Doublons" ? "catalog-metric-secondary" : ""
              }`}
              key={item.label}
            >
              <strong className="catalog-metric-value">{item.value}</strong>
              <span className="catalog-metric-label">{item.label}</span>
            </article>
          ))}
        </div>
        {data.filters.importId || data.filters.space !== "all" ? (
          <div className="catalog-context-list" aria-label="Contexte actif">
            {data.filters.importId ? (
              <span className="catalog-context-chip">Lot filtré</span>
            ) : null}
            {data.filters.space !== "all" ? (
              <span className="catalog-context-chip">
                {data.filters.space === "unassigned"
                  ? "Sans espace"
                  : data.selectedSpaceName}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function CatalogControls({ data }: { data: CatalogProductsResult }) {
  const { filters } = data;

  return (
    <section
      className="result-panel content-card catalog-controls"
      aria-label="Filtres catalogue"
    >
      <div className="content-card-inner">
        <div className="catalog-controls-heading">
          <p className="muted-text">
            {data.spaces.length === 0
              ? "Aucun espace créé"
              : "Filtrer les fiches"}
          </p>
          <Link className="text-link compact-link" href="/spaces">
            Gérer les espaces
            <UiIcon name="arrow-right" />
          </Link>
        </div>
        <form action="/catalog" className="catalog-search-form">
        {filters.importId ? (
          <input name="import" type="hidden" value={filters.importId} />
        ) : null}
        <label className="form-field" htmlFor="catalog-search">
          <span>Recherche</span>
          <input
            className="text-input"
            defaultValue={filters.q}
            id="catalog-search"
            name="q"
            placeholder="Titre, SKU, catégorie, description..."
            type="search"
          />
        </label>
        {filters.status !== "all" ? (
          <input name="status" type="hidden" value={filters.status} />
        ) : null}
        {filters.audit !== "all" ? (
          <input name="audit" type="hidden" value={filters.audit} />
        ) : null}
        {filters.completeness !== "all" ? (
          <input
            name="completeness"
            type="hidden"
            value={filters.completeness}
          />
        ) : null}
        {filters.deleted === "deleted" ? (
          <input name="deleted" type="hidden" value="deleted" />
        ) : null}
        <label className="form-field" htmlFor="catalog-space">
          <span>Espace</span>
          <select
            className="select-input"
            defaultValue={filters.space}
            id="catalog-space"
            name="space"
          >
            <option value="all">Tous les espaces</option>
            <option value="unassigned">Sans espace</option>
            {data.spaces.map((space) => (
              <option key={space.id} value={space.id}>
                {space.name}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field" htmlFor="catalog-sort">
          <span>Trier par</span>
          <select
            className="select-input"
            defaultValue={filters.sort}
            id="catalog-sort"
            name="sort"
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field" htmlFor="catalog-page-size">
          <span>Par page</span>
          <select
            className="select-input"
            defaultValue={filters.pageSize}
            id="catalog-page-size"
            name="pageSize"
          >
            {pageSizeOptions.map((pageSize) => (
              <option key={pageSize} value={pageSize}>
                {pageSize}
              </option>
            ))}
          </select>
        </label>
        <button className="primary-button" type="submit">
          <UiIcon name="search" />
          Rechercher
        </button>
        </form>

        <div className="catalog-filter-groups">
        <div className="catalog-filter-group">
          <span>Visibilité</span>
          <nav className="catalog-filter-tabs" aria-label="État des fiches">
            <Link
              aria-current={filters.deleted === "active" ? "page" : undefined}
              className={
                filters.deleted === "active"
                  ? "status-pill catalog-filter-active"
                  : "status-pill"
              }
              href={getCatalogHref(filters, { deleted: "active", page: 1 })}
            >
              Actives
            </Link>
            <Link
              aria-current={
                filters.deleted === "deleted" ? "page" : undefined
              }
              className={
                filters.deleted === "deleted"
                  ? "status-pill catalog-filter-active"
                  : "status-pill"
              }
              href={getCatalogHref(filters, { deleted: "deleted", page: 1 })}
            >
              Masquées
            </Link>
          </nav>
        </div>
        <div className="catalog-filter-group">
          <span>Statut</span>
          <nav className="catalog-filter-tabs" aria-label="Filtrer par statut">
            {statusOptions.map((option) => (
              <Link
                aria-current={
                  filters.status === option.value ? "page" : undefined
                }
                className={
                  filters.status === option.value
                    ? "status-pill catalog-filter-active"
                    : "status-pill"
                }
                href={getCatalogHref(filters, {
                  page: 1,
                  status: option.value
                })}
                key={option.value}
              >
                {option.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="catalog-filter-group">
          <span>Complétude</span>
          <nav
            className="catalog-filter-tabs"
            aria-label="Filtrer par complétude"
          >
            {completenessOptions.map((option) => (
              <Link
                aria-current={
                  filters.completeness === option.value ? "page" : undefined
                }
                className={
                  filters.completeness === option.value
                    ? "status-pill catalog-filter-active"
                    : "status-pill"
                }
                href={getCatalogHref(filters, {
                  completeness: option.value,
                  page: 1
                })}
                key={option.value}
              >
                {option.label}
                {option.value !== "all"
                  ? ` (${data.completenessCounts[option.value]})`
                  : ""}
              </Link>
            ))}
          </nav>
        </div>
        </div>

        <p className="muted-text catalog-count">
          {formatCount(
            data.resultCount,
            "fiche correspondante",
            "fiches correspondantes"
          )}{" "}
          sur {formatCount(data.totalCount, "fiche", "fiches")}
          {filters.status !== "all"
            ? ` - filtre ${getStatusLabel(filters.status)}`
            : ""}
          {filters.completeness !== "all"
            ? ` - complétude ${getCompletenessLabel(filters.completeness)}`
            : ""}
          {filters.audit !== "all" ? ` - ${getAuditLabel(filters.audit)}` : ""}
          {filters.space === "unassigned"
            ? " - sans espace"
            : filters.space !== "all"
              ? ` - espace ${data.selectedSpaceName ?? "sélectionné"}`
              : ""}
        </p>
      </div>
    </section>
  );
}

function CatalogImportContext({ data }: { data: CatalogProductsResult }) {
  if (data.importFilterStatus === "none") {
    return null;
  }

  if (data.importFilterStatus === "unavailable" || !data.importContext) {
    return (
      <section className="notice-panel catalog-import-context" role="status">
        <div>
          <p className="eyebrow">Lot importé</p>
          <h2>Import introuvable</h2>
          <p className="muted-text">
            Ce lot n’est pas disponible dans le workspace courant.
          </p>
        </div>
        <Link className="text-link compact-link" href="/catalog">
          Retirer le filtre
        </Link>
      </section>
    );
  }

  const { summary } = data.importContext;
  const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short"
  });

  return (
    <section
      className="result-panel catalog-import-context"
      aria-labelledby="catalog-import-title"
    >
      <div className="result-header">
        <div>
          <p className="eyebrow">Lot importé</p>
          <h2 id="catalog-import-title">
            {data.importContext.originalFilename}
          </h2>
          <p className="muted-text">
            Importé le{" "}
            <time dateTime={data.importContext.createdAt}>
              {dateFormatter.format(new Date(data.importContext.createdAt))}
            </time>
            . {formatCount(data.resultCount, "produit", "produits")}{" "}
            correspondent aux filtres actifs.
          </p>
        </div>
        <div className="inline-actions">
          <Link
            className="primary-link compact-link"
            href={`/imports/${encodeURIComponent(data.importContext.id)}`}
          >
            Voir l’import
            <UiIcon name="arrow-right" />
          </Link>
          <Link
            className="text-link compact-link"
            href={getCatalogHref(data.filters, { importId: "", page: 1 })}
          >
            Retirer le filtre
          </Link>
        </div>
      </div>

      <dl className="metadata-grid catalog-import-metrics">
        <div>
          <dt>Produits du lot</dt>
          <dd>{summary.productCount}</dd>
        </div>
        <div>
          <dt>À compléter</dt>
          <dd>{summary.needsInfoCount}</dd>
        </div>
        <div>
          <dt>À revoir</dt>
          <dd>{summary.needsReviewCount}</dd>
        </div>
        <div>
          <dt>Validés</dt>
          <dd>{summary.validatedCount}</dd>
        </div>
        <div>
          <dt>Masqués</dt>
          <dd>{summary.deletedProductCount}</dd>
        </div>
        <div>
          <dt>Audit à lancer</dt>
          <dd>{summary.missingAuditCount + summary.staleAuditCount}</dd>
        </div>
      </dl>

      <div className="batch-review-section">
        <div>
          <p className="eyebrow">Revue du lot</p>
          <h3>Accès rapides</h3>
        </div>
        <nav className="batch-quick-filters" aria-label="Filtres rapides du lot">
          <Link
            className="status-pill"
            href={getCatalogHref(data.filters, {
              audit: "all",
              completeness: "incomplete",
              deleted: "active",
              page: 1,
              status: "all"
            })}
          >
            Voir les incomplets
          </Link>
          <Link
            className="status-pill"
            href={getCatalogHref(data.filters, {
              audit: "all",
              completeness: "all",
              deleted: "active",
              page: 1,
              status: "draft"
            })}
          >
            Voir les brouillons
          </Link>
          <Link
            className="status-pill"
            href={getCatalogHref(data.filters, {
              audit: "missing",
              completeness: "all",
              deleted: "active",
              page: 1,
              status: "all"
            })}
          >
            Voir les produits sans audit
          </Link>
        </nav>
      </div>

      <div className="batch-review-section">
        <div>
          <p className="eyebrow">Actions du lot</p>
          <h3>Auditer ou masquer les fiches</h3>
        </div>
        <div className="batch-action-grid">
          {data.importContext.canAudit ? (
            <form action={auditImportedProductBatchAction}>
              <input
                name="importId"
                type="hidden"
                value={data.importContext.id}
              />
              <button
                className="secondary-button"
                disabled={summary.activeProductCount === 0}
                type="submit"
              >
                <UiIcon name="search" />
                Lancer l’audit du lot
              </button>
            </form>
          ) : null}

          {data.importContext.canManage && summary.activeProductCount > 0 ? (
            <details className="batch-confirmation">
              <summary>Masquer les produits de cet import</summary>
              <form action={softDeleteImportedProductBatchAction}>
                <input
                  name="importId"
                  type="hidden"
                  value={data.importContext.id}
                />
                <p>
                  {formatCount(
                    summary.activeProductCount,
                    "produit actif",
                    "produits actifs"
                  )}{" "}
                  {summary.activeProductCount === 1 ? "sera masqué" : "seront masqués"}.
                  {" "}
                  {formatCount(
                    summary.deletedProductCount,
                    "produit est déjà supprimé",
                    "produits sont déjà supprimés"
                  )}.
                </p>
                <p>
                  Les produits seront masqués, pas supprimés définitivement.
                  Les fichiers et exports seront conservés. Cette action pourra
                  être annulée.
                </p>
                <label className="form-field">
                  <span>
                    Saisissez exactement {data.importContext.originalFilename}
                  </span>
                  <input
                    autoComplete="off"
                    className="text-input"
                    name="confirmation"
                    required
                    type="text"
                  />
                </label>
                <button className="danger-button" type="submit">
                  <UiIcon name="trash" />
                  Confirmer le masquage
                </button>
              </form>
            </details>
          ) : null}

          {data.importContext.canManage && summary.deletedProductCount > 0 ? (
            <details className="batch-confirmation">
              <summary>Restaurer les produits de cet import</summary>
              <form action={restoreImportedProductBatchAction}>
                <input
                  name="importId"
                  type="hidden"
                  value={data.importContext.id}
                />
                <p>
                  {formatCount(
                    summary.deletedProductCount,
                    "produit supprimé",
                    "produits supprimés"
                  )}{" "}
                  {summary.deletedProductCount === 1
                    ? "sera restauré"
                    : "seront restaurés"}{" "}
                  sans recréation ni modification des données.
                </p>
                <label className="form-field">
                  <span>
                    Saisissez exactement {data.importContext.originalFilename}
                  </span>
                  <input
                    autoComplete="off"
                    className="text-input"
                    name="confirmation"
                    required
                    type="text"
                  />
                </label>
                <button className="secondary-button" type="submit">
                  <UiIcon name="check" />
                  Confirmer la restauration
                </button>
              </form>
            </details>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function CatalogPagination({ data }: { data: CatalogProductsResult }) {
  const { filters, pagination } = data;

  if (pagination.total === 0) {
    return null;
  }

  return (
    <nav className="catalog-pagination" aria-label="Pagination catalogue">
      <p className="muted-text catalog-count">
        {pagination.start}-{pagination.end} sur{" "}
        {formatCount(pagination.total, "fiche", "fiches")}
      </p>
      <div className="inline-actions catalog-page-actions">
        {pagination.page > 1 ? (
          <Link
            className="text-link compact-link"
            href={getCatalogHref(filters, { page: pagination.page - 1 })}
          >
            <UiIcon name="arrow-left" />
            Précédent
          </Link>
        ) : (
          <span className="muted-state icon-state">
            <UiIcon name="arrow-left" />
            Précédent
          </span>
        )}
        <span className="status-pill">
          Page {pagination.page} / {pagination.pageCount}
        </span>
        {pagination.page < pagination.pageCount ? (
          <Link
            className="text-link compact-link"
            href={getCatalogHref(filters, { page: pagination.page + 1 })}
          >
            Suivant
            <UiIcon name="arrow-right" />
          </Link>
        ) : (
          <span className="muted-state icon-state">
            Suivant
            <UiIcon name="arrow-right" />
          </span>
        )}
      </div>
    </nav>
  );
}

function CatalogEmptyState({ data }: { data: CatalogProductsResult }) {
  if (data.importFilterStatus === "unavailable") {
    return (
      <EmptyState
        action={
          <Link className="text-link compact-link" href="/catalog">
            Retirer le filtre
          </Link>
        }
        description="Ce lot n’est pas disponible dans le workspace courant."
        label="Import introuvable"
        title="Lot importé introuvable"
      />
    );
  }

  if (data.totalCount === 0) {
    if (data.importFilterStatus === "active") {
      return (
        <EmptyState
          action={
            <Link
              className="text-link compact-link"
              href={getCatalogHref(data.filters, {
                deleted: "active",
                importId: "",
                page: 1
              })}
            >
              Retirer le filtre
            </Link>
          }
          description="Aucune fiche de cet import ne correspond à la vue active."
          label="Lot importé vide"
          title="Aucune fiche dans ce lot"
        />
      );
    }

    if (data.filters.deleted === "deleted") {
      return (
        <EmptyState
          action={
            <Link className="text-link compact-link" href="/catalog">
              Voir les fiches actives
            </Link>
          }
          description="Les fiches masquées pourront être ouvertes puis restaurées ici."
          label="Aucune fiche supprimée"
          title="Aucune fiche masquée"
        />
      );
    }

    if (data.filters.space !== "all") {
      return (
        <EmptyState
          action={
            <Link className="text-link compact-link" href="/catalog">
              Retirer le filtre
            </Link>
          }
          description="Associez une fiche à cet espace ou changez de filtre."
          label="Espace vide"
          title="Aucune fiche dans cet espace"
        />
      );
    }

    return (
      <EmptyState
        action={
          <Link className="primary-link compact-link" href="/imports">
            <UiIcon name="upload" />
            Importer un CSV
          </Link>
        }
        description="Importez un catalogue CSV pour créer vos premières fiches."
        label="État du catalogue"
        title="Catalogue vide"
      />
    );
  }

  if (data.filters.q) {
    return (
      <EmptyState
        action={
          <Link className="text-link compact-link" href="/catalog">
            Réinitialiser les filtres
          </Link>
        }
        description="Essayez un autre titre, SKU, catégorie ou description."
        label="Aucun résultat catalogue"
        title="Aucune fiche ne correspond"
      />
    );
  }

  if (data.filters.completeness === "blocked") {
    return (
      <EmptyState
        action={
          <Link className="text-link compact-link" href="/catalog">
            Voir toutes les fiches
          </Link>
        }
        description="Aucune fiche ne présente de blocage de complétude."
        label="Aucune fiche bloquante"
        title="Aucun produit bloquant"
      />
    );
  }

  if (data.filters.completeness === "ready") {
    return (
      <EmptyState
        action={
          <Link className="text-link compact-link" href="/catalog">
            Voir toutes les fiches
          </Link>
        }
        description="Complétez les champs essentiels et recommandés avant validation."
        label="Aucune fiche prête"
        title="Aucune fiche prête à valider"
      />
    );
  }

  if (data.filters.completeness === "complete") {
    return (
      <EmptyState
        action={
          <Link className="text-link compact-link" href="/catalog">
            Voir toutes les fiches
          </Link>
        }
        description="Aucune fiche ne contient encore tous les champs attendus."
        label="Aucune fiche complète"
        title="Aucune fiche complète"
      />
    );
  }

  return (
    <EmptyState
      action={
        <Link className="text-link compact-link" href="/catalog">
          Réinitialiser les filtres
        </Link>
      }
      description="Changez de filtre ou importez de nouvelles fiches."
      label="Filtre catalogue vide"
      title="Aucune fiche dans cette vue"
    />
  );
}

export default async function CatalogPage({ searchParams }: CatalogPageProps) {
  const query = await searchParams;
  const data = await getCatalogProductsResult(query);
  const { products } = data;

  return (
    <AppShell>
      <PageHeader
        actions={
          <>
            <Link className="primary-link" href="/imports">
              <UiIcon name="upload" />
              Importer un CSV
            </Link>
            <Link className="text-link compact-link" href="/spaces">
              Gérer les espaces
            </Link>
          </>
        }
        description="Gérez, vérifiez et validez les fiches produit de votre catalogue."
        eyebrow="Produits"
        title="Catalogue"
        titleId="catalog-title"
      />

      {query?.soft_deleted === "1" ? (
        <InlineAlert variant="success">
          La fiche produit a été supprimée du catalogue actif. Elle reste
          restaurable.
        </InlineAlert>
      ) : null}
      {query?.batch_audited !== undefined ? (
        <InlineAlert variant="success">
          {query.batch_audited === "0"
            ? "Aucun produit à auditer."
            : `Audit lancé sur ${formatCount(
                getQueryCount(query.batch_audited),
                "produit",
                "produits"
              )}.`}
          {query.batch_audit_skipped &&
          query.batch_audit_skipped !== "0"
            ? ` ${formatCount(
                getQueryCount(query.batch_audit_skipped),
                "produit ignoré car supprimé",
                "produits ignorés car supprimés"
              )}.`
            : ""}
        </InlineAlert>
      ) : null}
      {query?.batch_deleted !== undefined ? (
        <InlineAlert variant="success">
          {query.batch_deleted === "0"
            ? "Aucun produit actif à masquer."
            : `${formatCount(
                getQueryCount(query.batch_deleted),
                "produit masqué",
                "produits masqués"
              )}.`}
          {query.batch_delete_skipped &&
          query.batch_delete_skipped !== "0"
            ? ` ${formatCount(
                getQueryCount(query.batch_delete_skipped),
                "produit était déjà supprimé",
                "produits étaient déjà supprimés"
              )}.`
            : ""}
        </InlineAlert>
      ) : null}
      {query?.batch_restored !== undefined ? (
        <InlineAlert variant="success">
          {query.batch_restored === "0"
            ? "Aucun produit à restaurer."
            : `${formatCount(
                getQueryCount(query.batch_restored),
                "produit restauré",
                "produits restaurés"
              )}.`}
        </InlineAlert>
      ) : null}
      {query?.batch_error ? (
        <InlineAlert variant="error">{query.batch_error}</InlineAlert>
      ) : null}
      <CatalogSummary data={data} />
      <CatalogImportContext data={data} />
      <CatalogControls data={data} />

      {products.length > 0 ? (
        <>
          <CatalogPagination data={data} />
          <CatalogBulkExportForm
            key={products.map((product) => product.id).join("|")}
            products={products}
          />
          <CatalogPagination data={data} />
        </>
      ) : (
        <CatalogEmptyState data={data} />
      )}
    </AppShell>
  );
}
