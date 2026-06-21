import { notFound } from "next/navigation";
import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { AuditFindingCard } from "@/components/product/audit-finding-card";
import { ProductImageUpload } from "@/components/product/product-image-upload";
import { TargetedActionLink } from "@/components/product/targeted-action-link";
import { ActionGroup } from "@/components/ui/action-group";
import { ProgressBar } from "@/components/ui/progress-bar";
import { PageHeader } from "@/components/ui/page-header";
import { UiIcon } from "@/components/ui/ui-icon";
import {
  addAuditQuickAction,
  analyzeProductCompleteness,
  getProductCompletenessQuickActionTargetId,
  getProductCompletenessTargetId,
  getTopProductCompletenessQuickActions,
  getProductStatusLabel,
  productCompletenessSectionTargetIds,
  type ProductCompletenessIssue,
  type ProductCompletenessQuickAction,
  type ProductCompletenessResult
} from "@/lib/product-completeness";
import { formatCount } from "@/lib/format-count";
import { getDeletedProductStatusLabel } from "@/lib/product-status";
import {
  applyAiSuggestionFieldAction,
  dismissAiSuggestionAction,
  requestProductSuggestionAction
} from "@/server/ai/actions";
import { getAiStatus } from "@/server/ai/core";
import { listProductAiSuggestions } from "@/server/ai/product-suggestions";
import { runProductAuditAction } from "@/server/audit/actions";
import { getLatestProductAudit } from "@/server/audit/product-audit";
import {
  deleteProductAction,
  removeProductImageAction,
  restoreProductAction,
  updateProductDraftAction,
  validateProductDraftAction
} from "@/server/products/actions";
import {
  getProductDetail,
  getWorkspaceSpaces,
  type WorkspaceSpace
} from "@/server/products/queries";
import {
  getProductBatchNavigation
} from "@/server/products/import-batch";
import type { ProductBatchNavigation } from "@/server/products/import-batch-core";
import { assignProductToSpaceAction } from "@/server/spaces/actions";
import type { ProductAudit } from "@/types/audit";
import type { AiErrorCode, ProductAiSuggestion } from "@/types/ai";
import type { ProductFieldKey } from "@/types/import";
import type {
  ProductDetail,
  ProductDraftData,
  ProductDraftValue
} from "@/types/product";

export const dynamic = "force-dynamic";

type ProductPageProps = {
  params: Promise<{ productId: string }>;
  searchParams?: Promise<{
    ai_error_code?: string;
    ai_error?: string;
    ai_suggestion?: string;
    error?: string;
    delete_error?: string;
    image_error?: string;
    image_removed?: string;
    image_saved?: string;
    price_error?: string;
    restore_error?: string;
    restored?: string;
    saved?: string;
    space_error?: string;
    space_saved?: string;
    validated?: string;
    validation_error?: string;
  }>;
};

const fieldLabels: Record<string, string> = {
  title: "Titre",
  subtitle: "Sous-titre",
  category: "Catégorie",
  description: "Description",
  materials: "Matières",
  dimensions: "Dimensions",
  origin: "Origine",
  current_price: "Prix actuel",
  desired_price: "Prix souhaité",
  cost_price: "Prix de revient",
  target_margin: "Marge cible",
  sku: "SKU",
  image_url: "Lien image",
  client_notes: "Notes client"
};

const aiErrorMessages: Record<AiErrorCode, string> = {
  disabled: "IA non configurée. Aucune suggestion n’a été créée.",
  config_error_missing_api_key:
    "IA non configurée. Aucune suggestion n’a été créée.",
  config_error_missing_model:
    "IA non configurée. Aucune suggestion n’a été créée.",
  provider_error_auth:
    "La suggestion n’est pas disponible pour le moment.",
  provider_error_model_not_found:
    "La suggestion n’est pas disponible pour le moment.",
  provider_error_billing:
    "La suggestion n’est pas disponible pour le moment.",
  provider_error_permission:
    "La suggestion n’est pas disponible pour le moment.",
  provider_error_rate_limit:
    "Le service de suggestion est temporairement indisponible. Réessayez plus tard.",
  provider_error_network:
    "Le service de suggestion est temporairement indisponible. Réessayez plus tard.",
  provider_error_timeout:
    "Le service de suggestion est temporairement indisponible. Réessayez plus tard.",
  provider_error_invalid_json:
    "La suggestion reçue n’a pas pu être utilisée.",
  provider_error_schema:
    "La suggestion reçue n’a pas pu être utilisée.",
  provider_error_safety_rejected:
    "La suggestion a été refusée car elle contenait des informations non vérifiables.",
  limit_reached_daily: "Limite IA quotidienne atteinte.",
  limit_reached_monthly: "Limite IA mensuelle atteinte.",
  failed_unknown: "La suggestion n’a pas pu être créée."
};

function getAiErrorMessage(errorCode?: string): string {
  return (
    aiErrorMessages[errorCode as AiErrorCode] ??
    aiErrorMessages.failed_unknown
  );
}

function getAiSuggestionStatusLabel(status: ProductAiSuggestion["status"]) {
  return status === "proposed"
    ? "Proposée"
    : status === "dismissed"
      ? "Rejetée"
      : "Échec";
}

const editableFieldGroups: Array<{
  fields: ProductFieldKey[];
  title: string;
}> = [
  {
    title: "Identité",
    fields: ["title", "subtitle", "category", "sku"]
  },
  {
    title: "Contenu",
    fields: [
      "description",
      "materials",
      "dimensions",
      "origin",
      "image_url",
      "client_notes"
    ]
  },
  {
    title: "Prix",
    fields: ["current_price", "desired_price", "cost_price", "target_margin"]
  }
];

const multilineFields = new Set<ProductFieldKey>([
  "description",
  "materials",
  "dimensions",
  "client_notes"
]);

const editableFieldKeys = new Set<ProductFieldKey>(
  editableFieldGroups.flatMap((group) => group.fields)
);

function getProductFieldId(field: ProductFieldKey): string {
  return getProductCompletenessTargetId(field);
}

function getFindingTargetFieldId(fieldKey: string): string | null {
  return editableFieldKeys.has(fieldKey as ProductFieldKey)
    ? getProductFieldId(fieldKey as ProductFieldKey)
    : null;
}

function formatValue(value: ProductDraftValue): string {
  if (value === null) {
    return "-";
  }

  return String(value);
}

function formatPrice(value: number | null): string | null {
  if (value === null) {
    return null;
  }

  return new Intl.NumberFormat("fr-FR", {
    currency: "EUR",
    style: "currency"
  }).format(value);
}

function getEditableValue(
  draftData: ProductDraftData,
  field: ProductFieldKey
): string {
  const value = draftData[field];
  return value === undefined || value === null ? "" : String(value);
}

function DraftDataList({ draftData }: { draftData: ProductDraftData }) {
  const entries = Object.entries(draftData).flatMap(([key, value]) =>
    key === "parsing_notes" ? [] : [[key, value as ProductDraftValue] as const]
  );

  return (
    <dl className="detail-list detail-list-compact">
      {entries.map(([key, value]) => (
        <div key={key}>
          <dt>{fieldLabels[key] ?? key}</dt>
          <dd>{formatValue(value)}</dd>
        </div>
      ))}
      {draftData.parsing_notes?.map((note) => (
        <div key={note}>
          <dt>Note d’import</dt>
          <dd>{note}</dd>
        </div>
      ))}
    </dl>
  );
}

function IssueList({
  emptyText,
  issues
}: {
  emptyText: string;
  issues: ProductCompletenessIssue[];
}) {
  if (issues.length === 0) {
    return <p className="muted-text">{emptyText}</p>;
  }

  return (
    <ul className="completion-list">
      {issues.map((issue) => (
        <li key={`${issue.field}-${issue.message}`}>
          <span>{issue.label}</span>
          <p>{issue.message}</p>
        </li>
      ))}
    </ul>
  );
}

function ProductMediaPanel({
  error,
  product,
  removed,
  saved
}: {
  error?: string;
  product: ProductDetail;
  removed?: string;
  saved?: string;
}) {
  const imageFieldId = getProductCompletenessTargetId("image_url");

  return (
    <section
      className="result-panel content-card product-detail-section product-media-panel targetable-section"
      id={productCompletenessSectionTargetIds.media}
      aria-labelledby="product-media-title"
      tabIndex={-1}
    >
      <div className="content-card-inner">
        <div className="result-header product-media-header">
          <div>
            <p className="eyebrow">Média produit</p>
            <h2 id="product-media-title">Image produit</h2>
          </div>
          <span className="status-pill">
            {product.imageUrl ? "Image enregistrée" : "Aucune image"}
          </span>
        </div>
        <div className="product-media-layout">
          {product.imageUrl ? (
            <div
              aria-label={`Image de ${product.title}`}
              className="product-media-image"
              role="img"
              style={{ backgroundImage: `url(${product.imageUrl})` }}
            />
          ) : (
            <div className="product-media-placeholder">
              <UiIcon name="upload" size={22} />
              <span>Aperçu de l’image</span>
            </div>
          )}
          <div className="product-media-actions">
            <p className="muted-text">
              {product.imageUrl
                ? "Remplacez l’image ou retirez-la de la fiche."
                : "Ajoutez une image locale ou renseignez un lien."}
            </p>
            <ProductImageUpload
              mode={product.imageUrl ? "replace" : "add"}
              productId={product.id}
            />
            <div className="product-media-secondary-actions">
              {!product.imageUrl ? (
                <TargetedActionLink
                  className="text-link compact-link"
                  targetId={imageFieldId}
                >
                  Renseigner un lien
                </TargetedActionLink>
              ) : null}
              {product.imageUrl ? (
                <form action={removeProductImageAction}>
                  <input name="productId" type="hidden" value={product.id} />
                  <button
                    className="danger-button compact-danger-button"
                    type="submit"
                  >
                    <UiIcon name="trash" />
                    Retirer l’image
                  </button>
                </form>
              ) : null}
            </div>
          </div>
        </div>
        {saved === "1" ? (
          <p className="product-media-feedback success-text">
            Image enregistrée.
          </p>
        ) : null}
        {removed === "1" ? (
          <p className="product-media-feedback success-text">Image retirée.</p>
        ) : null}
        {error ? (
          <p className="product-media-feedback error-text">{error}</p>
        ) : null}
      </div>
    </section>
  );
}

function ProductOverviewPanel({
  completeness,
  product
}: {
  completeness: ProductCompletenessResult;
  product: ProductDetail;
}) {
  const facts = [
    { label: "Catégorie", value: product.category },
    {
      label: "Espace",
      value: product.spaceName
        ? `${product.spaceName}${product.spaceArchivedAt ? " · archivé" : ""}`
        : null
    },
    { label: "Référence", value: product.sku },
    { label: "Prix actuel", value: formatPrice(product.currentPrice) },
    { label: "Prix souhaité", value: formatPrice(product.desiredPrice) }
  ].filter((item): item is { label: string; value: string } =>
    Boolean(item.value)
  );
  const details = [
    { label: "Matières", value: product.materials },
    { label: "Dimensions", value: product.dimensions },
    { label: "Origine", value: product.origin }
  ].filter((item): item is { label: string; value: string } =>
    Boolean(item.value)
  );
  const missingLabels = [
    ...completeness.missingRequiredFields,
    ...completeness.missingRecommendedFields
  ]
    .map((issue) => issue.label)
    .filter((label, index, labels) => labels.indexOf(label) === index)
    .slice(0, 6);

  return (
    <section
      className="result-panel content-card product-detail-section product-overview-panel"
      aria-labelledby="product-overview-title"
    >
      <div className="content-card-inner">
        <div className="result-header">
          <div>
            <p className="eyebrow">Aperçu</p>
            <h2 id="product-overview-title">Informations produit</h2>
          </div>
          <span className="score-badge">
            {completeness.completenessScore}/100
          </span>
        </div>

        {product.subtitle ? (
          <p className="product-overview-subtitle">{product.subtitle}</p>
        ) : null}
        {product.description ? (
          <p className="product-overview-description">{product.description}</p>
        ) : null}

        {facts.length > 0 ? (
          <dl className="product-overview-facts">
            {facts.map((fact) => (
              <div key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {details.length > 0 ? (
          <dl className="product-overview-details">
            {details.map((detail) => (
              <div key={detail.label}>
                <dt>{detail.label}</dt>
                <dd>{detail.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {missingLabels.length > 0 ? (
          <div className="product-missing-summary">
            <strong>À compléter</strong>
            <span>{missingLabels.join(" · ")}</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ProductBatchNavigationBar({
  navigation
}: {
  navigation: ProductBatchNavigation | null;
}) {
  if (!navigation) {
    return null;
  }

  return (
    <nav
      className="product-batch-navigation"
      aria-label="Navigation dans le lot"
    >
      {navigation.previousProductId ? (
        <Link
          className="product-batch-link"
          href={`/products/${encodeURIComponent(navigation.previousProductId)}`}
          aria-label="Produit précédent du lot"
        >
          <UiIcon name="arrow-left" />
          Précédent
        </Link>
      ) : (
        <span className="product-batch-edge" aria-hidden="true">
          <UiIcon name="arrow-left" />
          Début du lot
        </span>
      )}
      <span className="product-batch-position">
        {navigation.position} sur {navigation.total}
      </span>
      {navigation.nextProductId ? (
        <Link
          className="product-batch-link"
          href={`/products/${encodeURIComponent(navigation.nextProductId)}`}
          aria-label="Produit suivant du lot"
        >
          Suivant
          <UiIcon name="arrow-right" />
        </Link>
      ) : (
        <span className="product-batch-edge" aria-hidden="true">
          Fin du lot
          <UiIcon name="arrow-right" />
        </span>
      )}
      <Link
        className="product-batch-link product-batch-return"
        href={`/catalog?import=${encodeURIComponent(navigation.importId)}`}
      >
        Retour au lot
        <UiIcon name="arrow-right" />
      </Link>
    </nav>
  );
}

function ProductExportEligibilityPanel({
  product
}: {
  product: ProductDetail;
}) {
  const exportable = product.status === "validated" && !product.deletedAt;

  return (
    <section
      className="result-panel product-detail-section product-export-panel"
      aria-labelledby="product-export-title"
    >
      <div>
        <p className="eyebrow">Export</p>
        <h2 id="product-export-title">
          {exportable ? "Fiche exportable" : "Export verrouillé"}
        </h2>
        <p className="muted-text">
          {exportable
            ? "Les exports utiliseront uniquement le dernier snapshot validé."
            : "Validez la fiche avant de l’inclure dans un export."}
        </p>
      </div>
      {exportable ? (
        <Link className="secondary-button" href="/exports">
          <UiIcon name="download" />
          Ouvrir les exports
        </Link>
      ) : (
        <span className="status-pill status-pending">Non exportable</span>
      )}
    </section>
  );
}

const quickActionSeverityLabels: Record<
  ProductCompletenessQuickAction["severity"],
  string
> = {
  blocking: "Bloquant",
  recommended: "Recommandé",
  ready: "Prêt",
  warning: "À vérifier"
};

function getQuickActionCtaLabel(
  action: ProductCompletenessQuickAction
): string {
  if (action.completed) {
    return "Voir la validation";
  }

  if (action.type === "validate_product") {
    return "Ouvrir la validation";
  }

  if (action.type === "run_audit") {
    return "Ouvrir l’audit";
  }

  return "Corriger maintenant";
}

function QuickActionList({
  actions
}: {
  actions: ProductCompletenessQuickAction[];
}) {
  const visibleActions = getTopProductCompletenessQuickActions(actions);
  const [primaryAction, ...secondaryActions] = visibleActions;
  const hiddenActionCount = Math.max(0, actions.length - visibleActions.length);

  if (visibleActions.length === 0) {
    return (
      <p className="muted-text">
        Aucune action prioritaire pour cette fiche.
      </p>
    );
  }

  return (
    <>
      <div className="quick-action-list" aria-label="Actions recommandées">
        {primaryAction ? (
          <article
            className={`quick-action-card quick-action-primary quick-action-${primaryAction.severity}`}
            key={primaryAction.id}
          >
            <div className="quick-action-header">
              <span
                className={`severity-pill severity-${primaryAction.severity}`}
              >
                {quickActionSeverityLabels[primaryAction.severity]}
              </span>
              {primaryAction.targetField ? (
                <span>{fieldLabels[primaryAction.targetField]}</span>
              ) : null}
            </div>
            <h3>{primaryAction.label}</h3>
            <p>{primaryAction.description}</p>
            <TargetedActionLink
              className="primary-link compact-link"
              targetId={getProductCompletenessQuickActionTargetId(primaryAction)}
            >
              {getQuickActionCtaLabel(primaryAction)}
            </TargetedActionLink>
          </article>
        ) : null}
        {secondaryActions.map((action) => (
          <article
            className={`quick-action-card quick-action-${action.severity}`}
            key={action.id}
          >
            <div className="quick-action-header">
              <span className={`severity-pill severity-${action.severity}`}>
                {quickActionSeverityLabels[action.severity]}
              </span>
              {action.targetField ? (
                <span>{fieldLabels[action.targetField]}</span>
              ) : null}
            </div>
            <h3>{action.label}</h3>
            <p>{action.description}</p>
            <TargetedActionLink
              className="text-link compact-link"
              targetId={getProductCompletenessQuickActionTargetId(action)}
            >
              Aller à l’action
            </TargetedActionLink>
          </article>
        ))}
      </div>
      {hiddenActionCount > 0 ? (
        <p className="muted-text">
          +{" "}
          {formatCount(
            hiddenActionCount,
            "action restante",
            "actions restantes"
          )}
        </p>
      ) : null}
    </>
  );
}

function ProductCompletenessPanel({
  actions,
  completeness
}: {
  actions: ProductCompletenessQuickAction[];
  completeness: ProductCompletenessResult;
}) {
  return (
    <section
      className="result-panel product-detail-section"
      aria-labelledby="completeness-title"
    >
      <div className="result-header">
        <div>
          <p className="eyebrow">État de la fiche</p>
          <h2 id="completeness-title">Complétude produit</h2>
        </div>
        <span className="score-badge">
          {completeness.completenessScore}/100
        </span>
      </div>

      <div className="metadata-grid">
        <div>
          <dt>État</dt>
          <dd>{completeness.statusLabel}</dd>
        </div>
        <div>
          <dt>Validation</dt>
          <dd>
            {completeness.blockers.length === 0
              ? "Champs essentiels OK"
              : "Action requise"}
          </dd>
        </div>
      </div>

      <ProgressBar
        label="Progression de la fiche"
        value={completeness.completenessScore}
      />

      {completeness.blockers.length === 0 ? (
        <p className="success-text">
          La fiche semble prête côté champs essentiels.
        </p>
      ) : (
        <div className="warning-panel">
          <p>
            Certains champs essentiels bloquent encore une validation fiable.
          </p>
        </div>
      )}

      <div className="completion-actions-section">
        <div>
          <p className="eyebrow">À faire en priorité</p>
          <h3>Actions recommandées</h3>
        </div>
        <QuickActionList actions={actions} />
      </div>

      {completeness.missingRequiredFields.length > 0 ||
      completeness.missingRecommendedFields.length > 0 ||
      completeness.warnings.length > 0 ? (
        <div className="completion-grid">
          {completeness.missingRequiredFields.length > 0 ? (
            <div>
              <h3>Essentiels manquants</h3>
              <IssueList
                emptyText=""
                issues={completeness.missingRequiredFields}
              />
            </div>
          ) : null}
          {completeness.missingRecommendedFields.length > 0 ? (
            <div>
              <h3>Recommandés manquants</h3>
              <IssueList
                emptyText=""
                issues={completeness.missingRecommendedFields}
              />
            </div>
          ) : null}
          {completeness.warnings.length > 0 ? (
            <div>
              <h3>Points à vérifier</h3>
              <IssueList emptyText="" issues={completeness.warnings} />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ProductEditForm({ product }: { product: ProductDetail }) {
  return (
    <form action={updateProductDraftAction} className="product-edit-form">
      <input name="productId" type="hidden" value={product.id} />

      {editableFieldGroups.map((group) => (
        <fieldset className="product-edit-group" key={group.title}>
          <legend>{group.title}</legend>
          <div className="product-edit-grid">
            {group.fields.map((field) => {
              const id = getProductFieldId(field);
              const value = getEditableValue(product.draftData, field);

              return (
                <label
                  className="form-field targetable-field"
                  data-field-key={field}
                  htmlFor={id}
                  key={field}
                >
                  <span>{fieldLabels[field]}</span>
                  {multilineFields.has(field) ? (
                    <textarea
                      className="text-input textarea-input"
                      defaultValue={value}
                      id={id}
                      name={field}
                      rows={field === "description" ? 5 : 3}
                    />
                  ) : (
                    <input
                      className="text-input"
                      defaultValue={value}
                      id={id}
                      name={field}
                      type="text"
                    />
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}

      <div className="inline-actions">
        <button className="primary-button" type="submit">
          <UiIcon name="check" />
          Enregistrer
        </button>
      </div>
    </form>
  );
}

function ProductValidationPanel({
  audit,
  error,
  product,
  validated
}: {
  audit: ProductAudit | null;
  error?: string;
  product: ProductDetail;
  validated?: string;
}) {
  const blockingFindings =
    audit?.status === "current"
      ? audit.findings.filter((finding) => finding.severity === "blocking")
      : [];
  const auditStatus =
    audit?.status === "current"
      ? "À jour"
      : audit?.status === "stale"
        ? "À relancer"
        : "Non lancé";
  const productStatusLabel = getProductStatusLabel(product.status);

  return (
    <section
      className="result-panel product-detail-section targetable-section"
      id={productCompletenessSectionTargetIds.validation}
      aria-labelledby="validation-title"
      tabIndex={-1}
    >
      <div className="result-header">
        <div>
          <p className="eyebrow">Validation</p>
          <h2 id="validation-title">Validation client</h2>
        </div>
        <span className={`status-pill status-${product.status}`}>
          {productStatusLabel}
        </span>
      </div>

      <dl className="metadata-grid">
        <div>
          <dt>Statut produit</dt>
          <dd>{productStatusLabel}</dd>
        </div>
        <div>
          <dt>État de l’audit</dt>
          <dd>{auditStatus}</dd>
        </div>
      </dl>

      {product.validatedData ? (
        <p className="success-text">Une version validée existe pour cette fiche.</p>
      ) : null}
      {validated === "1" ? (
        <p className="success-text">La fiche est validée.</p>
      ) : null}
      {audit?.status === "stale" ? (
        <div className="warning-panel">
          <p>
            L’audit n’est plus à jour. Relancez l’audit avant de valider pour
            une fiche plus fiable.
          </p>
        </div>
      ) : null}
      {blockingFindings.length > 0 ? (
        <div className="warning-panel">
          <p>
            Validation bloquée : des informations critiques sont manquantes.
          </p>
          <div className="finding-list" aria-label="Points bloquants">
            {blockingFindings.map((finding) => (
              <article className="finding-item" key={finding.id}>
                <div className="finding-item-header">
                  <span className="severity-pill severity-blocking">
                    Bloquant
                  </span>
                  <span>{fieldLabels[finding.fieldKey] ?? finding.fieldKey}</span>
                </div>
                <p>{finding.message}</p>
                <p className="muted-text">{finding.recommendation}</p>
              </article>
            ))}
          </div>
        </div>
      ) : null}
      {error ? <p className="error-text">{error}</p> : null}

      <form action={validateProductDraftAction} className="inline-actions">
        <input name="productId" type="hidden" value={product.id} />
        <button
          className="primary-button"
          disabled={blockingFindings.length > 0}
          type="submit"
        >
          <UiIcon name="check" />
          Valider la fiche
        </button>
      </form>
    </section>
  );
}

function ProductAuditPanel({
  audit,
  error,
  productId
}: {
  audit: ProductAudit | null;
  error?: string;
  productId: string;
}) {
  return (
    <section
      className="result-panel product-detail-section targetable-section"
      id={productCompletenessSectionTargetIds.audit}
      aria-labelledby="audit-title"
      tabIndex={-1}
    >
      <div className="result-header">
        <div>
          <p className="eyebrow">Audit Fichr</p>
          <h2 id="audit-title">Contrôle déterministe</h2>
        </div>
        {audit ? (
          <span className="score-badge">{audit.score}/100</span>
        ) : (
          <span className="status-pill">Non lancé</span>
        )}
      </div>

      <p className="muted-text">
        Score indicatif basé sur les champs présents. Il aide à prioriser les
        corrections, sans remplacer la décision humaine.
      </p>

      {audit?.status === "stale" ? (
        <div className="warning-panel">
          <p>
            La fiche a été modifiée. Relancez l’audit pour mettre l’analyse à
            jour.
          </p>
        </div>
      ) : null}

      {error ? <p className="error-text">{error}</p> : null}

      <form action={runProductAuditAction} className="inline-actions">
        <input name="productId" type="hidden" value={productId} />
        <button className="primary-button" type="submit">
          <UiIcon name="check" />
          Lancer l’audit
        </button>
      </form>

      {audit ? (
        <div className="audit-results">
          <div className="metadata-grid">
            <div>
              <dt>État de l’audit</dt>
              <dd>{audit.status === "current" ? "À jour" : "À relancer"}</dd>
            </div>
            <div>
              <dt>Points relevés</dt>
              <dd>{audit.findings.length}</dd>
            </div>
          </div>

          {audit.findings.length > 0 ? (
            <div className="finding-list" aria-label="Points relevés par l’audit">
              {audit.findings.map((finding) => (
                <AuditFindingCard
                  finding={finding}
                  key={finding.id}
                  targetFieldId={getFindingTargetFieldId(finding.fieldKey)}
                />
              ))}
            </div>
          ) : (
            <p className="muted-text">
              Aucun point bloquant ou avertissement détecté par les règles actuelles.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}

function ProductAiSuggestionPanel({
  errorCode,
  error,
  productId,
  result,
  suggestions
}: {
  errorCode?: string;
  error?: string;
  productId: string;
  result?: string;
  suggestions: ProductAiSuggestion[];
}) {
  const aiStatus = getAiStatus();
  const activeSuggestions = suggestions.filter(
    (suggestion) => suggestion.status === "proposed"
  );
  const dismissedSuggestions = suggestions.filter(
    (suggestion) => suggestion.status === "dismissed"
  );

  return (
    <section
      className="result-panel product-detail-section"
      aria-labelledby="ai-suggestions-title"
    >
      <div className="result-header">
        <div>
          <p className="eyebrow">Suggestions IA</p>
          <h2 id="ai-suggestions-title">Aide contrôlée</h2>
        </div>
        <span className="status-pill">
          {aiStatus.status === "disabled" ? "IA non configurée" : "IA disponible"}
        </span>
      </div>

      <p className="muted-text">
        {aiStatus.status === "disabled"
          ? "IA non configurée. L’architecture serveur est prête pour de futures suggestions."
          : "Suggestion contrôlée disponible côté serveur."}{" "}
        Les suggestions ne modifient jamais automatiquement les données de
        travail ou les données validées.
      </p>
      {result === "disabled" ? (
        <p className="muted-text">
          IA non configurée. Aucune suggestion n’a été créée.
        </p>
      ) : null}
      {result === "proposed" ? (
        <p className="success-text">
          Suggestion préparée. Elle reste séparée de la fiche produit.
        </p>
      ) : null}
      {result === "failed" ? (
        <p className="error-text">
          {getAiErrorMessage(errorCode)}
        </p>
      ) : null}
      {result === "dismissed" ? (
        <p className="muted-text">
          Suggestion rejetée. Elle n’est plus active, sans être supprimée.
        </p>
      ) : null}
      {result === "applied" ? (
        <p className="success-text">
          Champ appliqué au brouillon. Les données validées restent inchangées.
        </p>
      ) : null}
      {result === "unchanged" ? (
        <p className="muted-text">
          Ce champ contenait déjà cette proposition.
        </p>
      ) : null}
      {result === "not_active" ? (
        <p className="muted-text">
          Cette suggestion n’est déjà plus active.
        </p>
      ) : null}
      {error ? (
        <p className="error-text">
          La suggestion n’a pas pu être traitée.
        </p>
      ) : null}
      <form action={requestProductSuggestionAction} className="inline-actions">
        <input name="productId" type="hidden" value={productId} />
        <button className="primary-button" type="submit">
          Préparer une suggestion
        </button>
      </form>
      {activeSuggestions.length > 0 ? (
        <div className="finding-list" aria-label="Suggestions IA proposées">
          {activeSuggestions.map((suggestion) => (
            <article className="finding-item" key={suggestion.id}>
              <div className="finding-item-header">
                <span className="status-pill">
                  {getAiSuggestionStatusLabel(suggestion.status)}
                </span>
                <span>Suggestion séparée de la fiche</span>
              </div>
              <dl className="detail-list">
                {suggestion.suggestionData.proposed_subtitle ? (
                  <div>
                    <dt>Sous-titre proposé</dt>
                    <dd>{suggestion.suggestionData.proposed_subtitle}</dd>
                    <form
                      action={applyAiSuggestionFieldAction}
                      className="inline-actions"
                    >
                      <input
                        name="suggestionId"
                        type="hidden"
                        value={suggestion.id}
                      />
                      <input name="fieldKey" type="hidden" value="subtitle" />
                      <button className="primary-button" type="submit">
                        Appliquer ce sous-titre
                      </button>
                    </form>
                  </div>
                ) : null}
                {suggestion.suggestionData.proposed_description ? (
                  <div>
                    <dt>Description proposée</dt>
                    <dd>{suggestion.suggestionData.proposed_description}</dd>
                    <form
                      action={applyAiSuggestionFieldAction}
                      className="inline-actions"
                    >
                      <input
                        name="suggestionId"
                        type="hidden"
                        value={suggestion.id}
                      />
                      <input
                        name="fieldKey"
                        type="hidden"
                        value="description"
                      />
                      <button className="primary-button" type="submit">
                        Appliquer cette description
                      </button>
                    </form>
                  </div>
                ) : null}
                <div>
                  <dt>Champs manquants</dt>
                  <dd>
                    {suggestion.suggestionData.missing_fields.length > 0
                      ? suggestion.suggestionData.missing_fields
                          .map((field) => fieldLabels[field] ?? field)
                          .join(", ")
                      : "Aucun champ manquant détecté"}
                  </dd>
                </div>
                <div>
                  <dt>Questions à poser</dt>
                  <dd>
                    {suggestion.suggestionData.questions_to_ask.length > 0
                      ? suggestion.suggestionData.questions_to_ask.join(" ")
                      : "Aucune question"}
                  </dd>
                </div>
                <div>
                  <dt>Confiance</dt>
                  <dd>{suggestion.suggestionData.confidence_score}/100</dd>
                </div>
                <div>
                  <dt>Règle</dt>
                  <dd>{suggestion.suggestionData.non_invention_notice}</dd>
                </div>
              </dl>
              <p className="muted-text">
                Application champ par champ uniquement vers les données de
                travail. Aucune donnée validée n’est modifiée.
              </p>
              <form action={dismissAiSuggestionAction} className="inline-actions">
                <input
                  name="suggestionId"
                  type="hidden"
                  value={suggestion.id}
                />
                <button className="danger-button" type="submit">
                  Rejeter
                </button>
              </form>
            </article>
          ))}
        </div>
      ) : (
        <p className="muted-text">
          Aucune suggestion active pour cette fiche.
        </p>
      )}
      {dismissedSuggestions.length > 0 ? (
        <div className="finding-list" aria-label="Suggestions IA rejetées">
          <p className="eyebrow">Suggestions rejetées</p>
          {dismissedSuggestions.map((suggestion) => (
            <article className="finding-item" key={suggestion.id}>
              <div className="finding-item-header">
                <span className="status-pill">
                  {getAiSuggestionStatusLabel(suggestion.status)}
                </span>
                <span>Conservée dans l’historique, non active</span>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ProductDangerPanel({
  error,
  product
}: {
  error?: string;
  product: ProductDetail;
}) {
  return (
    <section
      className="result-panel danger-panel product-detail-section"
      aria-labelledby="product-danger-title"
    >
      <div>
        <p className="eyebrow">Gestion de la fiche</p>
        <h2 id="product-danger-title">Supprimer la fiche</h2>
      </div>
      <p className="muted-text">
        La fiche quittera le catalogue actif mais restera restaurable. Son
        image, ses données de travail et son dernier snapshot validé sont
        conservés.
      </p>
      <form action={deleteProductAction} className="danger-confirmation-form">
        <input name="productId" type="hidden" value={product.id} />
        <label className="form-field" htmlFor="product-delete-confirmation">
          <span>
            Saisissez exactement « {product.title} » pour confirmer.
          </span>
          <input
            autoComplete="off"
            className="text-input"
            id="product-delete-confirmation"
            name="confirmation"
            required
            type="text"
          />
        </label>
        <button className="danger-button" type="submit">
          <UiIcon name="trash" />
          Supprimer la fiche
        </button>
      </form>
      {error ? <p className="error-text">{error}</p> : null}
    </section>
  );
}

function ProductSpacePanel({
  error,
  product,
  saved,
  spaces
}: {
  error?: string;
  product: ProductDetail;
  saved?: string;
  spaces: WorkspaceSpace[];
}) {
  return (
    <section
      className="result-panel product-detail-section"
      aria-labelledby="product-space-title"
    >
      <div className="result-header">
        <div>
          <p className="eyebrow">Organisation</p>
          <h2 id="product-space-title">Espace</h2>
        </div>
        <span className="status-pill">
          {product.spaceArchivedAt
            ? "Espace archivé"
            : product.spaceName ?? "Sans espace"}
        </span>
      </div>
      <p className="muted-text">
        Classez cette fiche dans un espace sans modifier ses données de travail
        ni ses données validées.
      </p>
      {product.spaceArchivedAt ? (
        <div className="warning-panel">
          <p>
            Ancien espace : {product.spaceName}. Choisissez un espace actif ou
            remettez la fiche sans espace.
          </p>
        </div>
      ) : null}
      <form action={assignProductToSpaceAction} className="product-space-form">
        <input name="productId" type="hidden" value={product.id} />
        <label className="form-field" htmlFor="product-space">
          <span>Espace actuel</span>
          <select
            className="select-input"
            defaultValue={product.spaceId ?? ""}
            id="product-space"
            name="spaceId"
          >
            <option value="">Sans espace</option>
            {spaces.map((space) => (
              <option key={space.id} value={space.id}>
                {space.name}
              </option>
            ))}
          </select>
        </label>
        <button className="secondary-button" type="submit">
          <UiIcon name="check" />
          Enregistrer l’espace
        </button>
      </form>
      <Link className="text-link compact-link" href="/spaces">
        Créer ou gérer un espace
        <UiIcon name="arrow-right" />
      </Link>
      {saved === "1" ? (
        <p className="success-text">Espace mis à jour.</p>
      ) : null}
      {error ? <p className="error-text">{error}</p> : null}
    </section>
  );
}

function ProductImportOriginPanel({
  product
}: {
  product: ProductDetail;
}) {
  if (!product.importOrigin) {
    return null;
  }

  const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short"
  });

  return (
    <section
      className="result-panel product-detail-section product-origin-panel"
      aria-labelledby="product-origin-title"
    >
      <div className="result-header">
        <div>
          <p className="eyebrow">Origine de la fiche</p>
          <h2 id="product-origin-title">
            {product.importOrigin.originalFilename}
          </h2>
        </div>
        <span className="status-pill">Import CSV</span>
      </div>
      <dl className="metadata-grid">
        <div>
          <dt>Date d’import</dt>
          <dd>
            <time dateTime={product.importOrigin.createdAt}>
              {dateFormatter.format(new Date(product.importOrigin.createdAt))}
            </time>
          </dd>
        </div>
        <div>
          <dt>Ligne source</dt>
          <dd>
            {product.importOrigin.rowIndex === null
              ? "Non renseignée"
              : product.importOrigin.rowIndex}
          </dd>
        </div>
      </dl>
      <div className="inline-actions">
        <Link
          className="text-link compact-link"
          href={`/imports/${encodeURIComponent(product.importOrigin.id)}`}
        >
          Voir l’import
          <UiIcon name="arrow-right" />
        </Link>
        <Link
          className="text-link compact-link"
          href={`/catalog?import=${encodeURIComponent(product.importOrigin.id)}`}
        >
          Voir le lot importé
          <UiIcon name="arrow-right" />
        </Link>
      </div>
    </section>
  );
}

function DeletedProductPanel({
  error,
  product
}: {
  error?: string;
  product: ProductDetail;
}) {
  return (
    <section
      className="result-panel danger-panel product-detail-section"
      aria-labelledby="deleted-product-title"
    >
      <div className="result-header">
        <div>
          <p className="eyebrow">Fiche supprimée</p>
          <h2 id="deleted-product-title">Cette fiche n’apparaît plus dans le catalogue actif.</h2>
        </div>
        <span className="status-pill status-deleted">
          {getDeletedProductStatusLabel()}
        </span>
      </div>
      <p className="muted-text">
        Les données, le dernier snapshot validé et l’image locale sont
        conservés. Restaurez la fiche avant de la modifier, l’auditer ou la
        valider.
      </p>
      <dl className="metadata-grid">
        <div>
          <dt>Espace</dt>
          <dd>{product.spaceName ?? "Sans espace"}</dd>
        </div>
        <div>
          <dt>Suppression</dt>
          <dd>{product.deletedAt ?? "Date non enregistrée"}</dd>
        </div>
      </dl>
      <form action={restoreProductAction} className="inline-actions">
        <input name="productId" type="hidden" value={product.id} />
        <button className="primary-button" type="submit">
          <UiIcon name="check" />
          Restaurer la fiche
        </button>
        <Link className="text-link compact-link" href="/catalog?deleted=deleted">
          Voir les fiches supprimées
        </Link>
      </form>
      {error ? <p className="error-text">{error}</p> : null}
    </section>
  );
}

export default async function ProductPage({
  params,
  searchParams
}: ProductPageProps) {
  const { productId } = await params;
  const query = await searchParams;
  const product = await getProductDetail(productId);

  if (!product) {
    notFound();
  }

  const spaces = await getWorkspaceSpaces();

  if (product.deletedAt) {
    return (
      <AppShell>
        <PageHeader
          back={
            <Link className="back-link" href="/catalog?deleted=deleted">
              <UiIcon name="arrow-left" />
              Retour aux fiches masquées
            </Link>
          }
          description="Cette fiche reste consultable et peut être restaurée."
          eyebrow="Fiche masquée"
          title={product.title}
          titleId="product-title"
        />
        <DeletedProductPanel
          error={query?.restore_error}
          product={product}
        />
        <ProductImportOriginPanel product={product} />
      </AppShell>
    );
  }

  const audit = await getLatestProductAudit(productId);
  const batchNavigation = product.importOrigin
    ? await getProductBatchNavigation(productId)
    : null;
  const aiSuggestions = await listProductAiSuggestions(product.id);
  const completeness = analyzeProductCompleteness(product);
  const quickActions = addAuditQuickAction(
    completeness.quickActions,
    audit?.status ?? "none"
  );
  const productStatusLabel = getProductStatusLabel(product.status);

  return (
    <AppShell>
      <PageHeader
        actions={
          <ActionGroup>
            <span className={`status-pill status-${product.status}`}>
              {productStatusLabel}
            </span>
            <span className="score-badge">
              {completeness.completenessScore}/100
            </span>
            <Link
              className="primary-link"
              href={
                product.status === "validated"
                  ? "#product-validation"
                  : "#product-edit"
              }
            >
              <UiIcon
                name={
                  product.status === "validated" ? "circle-check" : "check"
                }
              />
              {product.status === "validated"
                ? "Voir la validation"
                : "Corriger la fiche"}
            </Link>
          </ActionGroup>
        }
        back={
          <Link
            className="back-link"
            href={
              product.importOrigin
                ? `/catalog?import=${encodeURIComponent(product.importOrigin.id)}`
                : "/catalog"
            }
          >
            <UiIcon name="arrow-left" />
            {product.importOrigin ? "Retour au lot" : "Retour au catalogue"}
          </Link>
        }
        description="Corrigez les données, relancez l’audit puis validez la fiche."
        eyebrow={productStatusLabel}
        title={product.title}
        titleId="product-title"
      />

      {query?.restored === "1" ? (
        <p className="success-text catalog-page-feedback">
          Fiche restaurée dans le catalogue actif.
        </p>
      ) : null}

      <ProductBatchNavigationBar navigation={batchNavigation} />

      <div className="product-core-layout">
        <ProductMediaPanel
          error={query?.image_error}
          product={product}
          removed={query?.image_removed}
          saved={query?.image_saved}
        />

        <ProductOverviewPanel
          completeness={completeness}
          product={product}
        />
      </div>

      <ProductCompletenessPanel
        actions={quickActions}
        completeness={completeness}
      />

      <ProductSpacePanel
        error={query?.space_error}
        product={product}
        saved={query?.space_saved}
        spaces={spaces}
      />

      <section
        className="result-panel product-detail-section targetable-section"
        id={productCompletenessSectionTargetIds.edition}
        aria-labelledby="fields-title"
        tabIndex={-1}
      >
        <div className="result-header">
          <div>
            <p className="eyebrow">Champs principaux</p>
            <h2 id="fields-title">Édition</h2>
          </div>
          <span className={`status-pill status-${product.status}`}>
            {productStatusLabel}
          </span>
        </div>
        <p className="muted-text">
          Modifiez uniquement les données de travail. Les données validées ne
          sont pas touchées.
        </p>
        {query?.saved === "1" ? (
          <p className="success-text">Modifications enregistrées.</p>
        ) : null}
        {query?.price_error === "1" ? (
          <p className="error-text">
            Un prix n’a pas pu être converti. La valeur saisie est conservée
            dans les données de travail.
          </p>
        ) : null}
        <ProductEditForm product={product} />
      </section>

      <section
        className="result-panel draft-reading-panel product-detail-section product-draft-panel"
        aria-labelledby="draft-title"
      >
        <details className="product-draft-details">
          <summary>
            <span>
              <span className="eyebrow">Données conservées</span>
              <strong id="draft-title">Voir le brouillon structuré</strong>
            </span>
            <span className="muted-state">Détails</span>
          </summary>
          <div className="product-draft-content">
            <p className="muted-text">
              Valeurs de travail et notes de parsing conservées avant
              validation.
            </p>
            <DraftDataList draftData={product.draftData} />
          </div>
        </details>
      </section>

      <ProductAuditPanel
        audit={audit}
        error={query?.error}
        productId={product.id}
      />

      <ProductImportOriginPanel product={product} />

      <ProductValidationPanel
        audit={audit}
        error={query?.validation_error}
        product={product}
        validated={query?.validated}
      />

      <ProductExportEligibilityPanel product={product} />

      <ProductAiSuggestionPanel
        errorCode={query?.ai_error_code}
        error={query?.ai_error}
        productId={product.id}
        result={query?.ai_suggestion}
        suggestions={aiSuggestions}
      />

      <ProductDangerPanel error={query?.delete_error} product={product} />
    </AppShell>
  );
}
