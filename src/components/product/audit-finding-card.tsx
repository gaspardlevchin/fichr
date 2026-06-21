import { FieldJumpButton } from "@/components/product/field-jump-button";
import { WarningIcon } from "@/components/ui/warning-icon";
import type {
  AuditFieldKey,
  AuditFinding,
  AuditFindingSeverity,
  AuditFindingType
} from "@/types/audit";

const fieldLabels: Partial<Record<AuditFieldKey, string>> = {
  category: "catégorie",
  client_notes: "notes client",
  cost_price: "coût de revient",
  current_price: "prix actuel",
  description: "description",
  desired_price: "prix souhaité",
  dimensions: "dimensions",
  image_url: "image",
  materials: "matières",
  origin: "origine",
  price: "prix",
  sku: "SKU",
  subtitle: "sous-titre",
  target_margin: "marge cible",
  technical: "donnée technique",
  title: "titre",
  usage: "usage"
};

const severityLabels: Record<AuditFindingSeverity, string> = {
  blocking: "Bloquant",
  info: "Information",
  warning: "Attention"
};

const typeLabels: Record<AuditFindingType, string> = {
  inconsistent: "Incohérence",
  misplaced: "Information mal placée",
  missing: "Champ manquant",
  price_risk: "Risque prix",
  recommended_missing: "Information recommandée",
  technical_required: "Donnée technique",
  too_long: "Texte trop long"
};

const typeReasons: Record<AuditFindingType, string> = {
  inconsistent:
    "Fichr détecte une incohérence entre des informations qui devraient se confirmer.",
  misplaced:
    "Fichr voit une information utile dans un endroit moins exploitable pour la fiche.",
  missing:
    "Fichr signale une information attendue qui manque dans les données de travail.",
  price_risk:
    "Fichr ne peut pas lire correctement la logique de prix ou de marge avec les données actuelles.",
  recommended_missing:
    "Fichr recommande cette information pour rendre la fiche plus facile à comprendre.",
  technical_required:
    "Fichr signale une donnée technique qui doit être confirmée plutôt que déduite.",
  too_long:
    "Fichr signale un texte qui peut devenir difficile à parcourir dans une fiche produit."
};

const technicalFields = new Set<AuditFieldKey>([
  "cost_price",
  "current_price",
  "desired_price",
  "dimensions",
  "materials",
  "origin",
  "price",
  "target_margin",
  "technical",
  "usage"
]);

type FindingExplanation = {
  action: string;
  decision: string;
  reason: string;
  risk: string;
};

function getRiskExplanation(finding: AuditFinding): string {
  if (finding.severity === "blocking") {
    return "Le risque concret est de valider une fiche avec une information critique absente ou non confirmée.";
  }

  if (finding.type === "price_risk" || finding.fieldKey === "price") {
    return "Fichr ne peut pas vérifier la marge ou la cohérence commerciale sans prix et coût fiables.";
  }

  if (finding.type === "missing") {
    return "Cette absence peut créer une hésitation au moment de l’achat ou ralentir une validation interne.";
  }

  if (finding.type === "too_long" || finding.type === "misplaced") {
    return "Le risque est surtout une lecture moins claire : le client peut manquer une information pourtant présente.";
  }

  return "Le risque est limité, mais cette précision peut rendre la fiche plus lisible et plus fiable.";
}

function formatLegacyAuditCopy(value: string): string {
  const replacements: Array<[RegExp, string]> = [
    [/\bn est\b/g, "n’est"],
    [/\bqu elle\b/g, "qu’elle"],
    [/\bl intention\b/g, "l’intention"],
    [/\bl achat\b/g, "l’achat"],
    [/\bs il\b/g, "s’il"],
    [/\ba confirmer\b/g, "à confirmer"],
    [/\ba comprendre\b/g, "à comprendre"],
    [/\ba parcourir\b/g, "à parcourir"],
    [/\bcategorie\b/g, "catégorie"],
    [/\bcoherence\b/g, "cohérence"],
    [/\bcout\b/g, "coût"],
    [/\bcreative\b/g, "créative"],
    [/\bdonnee\b/g, "donnée"],
    [/\bdonnees\b/g, "données"],
    [/\bmatieres\b/g, "matières"],
    [/\bmatiere\b/g, "matière"],
    [/\bpremiere\b/g, "première"],
    [/\bpresente\b/g, "présente"],
    [/\brecommandee\b/g, "recommandée"],
    [/\breference\b/g, "référence"],
    [/\brenseigne\b/g, "renseigné"],
    [/\brenseignee\b/g, "renseignée"],
    [/\bsouhaite\b/g, "souhaité"],
    [/\bverifier\b/g, "vérifier"],
    [/\bverifiee\b/g, "vérifiée"]
  ];

  return replacements.reduce(
    (formatted, [pattern, replacement]) =>
      formatted.replace(pattern, replacement),
    value
  );
}

export function getFindingExplanation(
  finding: AuditFinding
): FindingExplanation {
  const fieldLabel = fieldLabels[finding.fieldKey] ?? finding.fieldKey;
  const isTechnical = technicalFields.has(finding.fieldKey);
  const titleContext =
    finding.fieldKey === "title"
      ? " Si le nom est volontairement artistique, un sous-titre descriptif peut suffire."
      : "";

  return {
    reason: `${typeReasons[finding.type]} Champ concerné : ${fieldLabel}.${titleContext}`,
    risk: getRiskExplanation(finding),
    action: formatLegacyAuditCopy(finding.recommendation),
    decision:
      finding.requiresClientDecision || !isTechnical
        ? "Le client garde la main : ce point peut rester un choix artistique ou éditorial s’il est intentionnel."
        : "Cette donnée est technique : elle doit être confirmée plutôt que déduite."
  };
}

export function AuditFindingCard({
  finding,
  targetFieldId
}: {
  finding: AuditFinding;
  targetFieldId?: string | null;
}) {
  const explanation = getFindingExplanation(finding);
  const showWarningIcon = finding.severity !== "info";
  const fieldLabel = fieldLabels[finding.fieldKey] ?? finding.fieldKey;

  return (
    <article className={`finding-item finding-item-${finding.severity}`}>
      <div className="finding-item-header">
        {showWarningIcon ? <WarningIcon /> : null}
        <span className={`severity-pill severity-${finding.severity}`}>
          {severityLabels[finding.severity]}
        </span>
        <span className="finding-meta">{typeLabels[finding.type]}</span>
        <span className="finding-meta">Champ : {fieldLabel}</span>
      </div>
      <p>{formatLegacyAuditCopy(finding.message)}</p>
      <p className="muted-text">
        {formatLegacyAuditCopy(finding.recommendation)}
      </p>
      {finding.requiresClientDecision ? (
        <p className="decision-note">Décision client recommandée</p>
      ) : null}
      {targetFieldId ? (
        <div className="finding-actions">
          <FieldJumpButton targetId={targetFieldId} />
        </div>
      ) : null}

      <details className="finding-disclosure">
        <summary>Pourquoi ?</summary>
        <div className="finding-explanation">
          <p>
            <strong>Pourquoi Fichr le signale</strong>
            {explanation.reason}
          </p>
          <p>
            <strong>Risque concret</strong>
            {explanation.risk}
          </p>
          <p>
            <strong>Action possible</strong>
            {explanation.action}
          </p>
          <p>
            <strong>Decision humaine</strong>
            {explanation.decision}
          </p>
        </div>
      </details>
    </article>
  );
}
