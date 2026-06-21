import { and, desc, eq, isNull, sql } from "drizzle-orm";

import {
  auditFindings,
  productAudits,
  products
} from "../../../db/schema";
import { logEvent } from "@/server/audit/event-log";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { db } from "@/server/db/client";
import { createServerId } from "@/server/ids";
import type {
  AuditFieldKey,
  AuditFinding,
  AuditFindingSeverity,
  AuditFindingType,
  NewAuditFinding,
  ProductAudit
} from "@/types/audit";
import type { ProductDetail } from "@/types/product";

const auditReadRoles = ["owner", "admin", "editor", "viewer"] as const;
const auditWriteRoles = ["owner", "admin", "editor"] as const;

type ProductAuditSource = ProductDetail & {
  workspaceId: string;
};

function isMissing(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === "";
}

function includesAny(value: string | null, needles: string[]): boolean {
  if (!value) {
    return false;
  }

  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return needles.some((needle) => normalized.includes(needle));
}

function getText(product: ProductAuditSource, field: keyof ProductDetail): string {
  const value = product[field];
  return typeof value === "string" ? value : "";
}

function addFinding(
  findings: NewAuditFinding[],
  severity: AuditFindingSeverity,
  type: AuditFindingType,
  fieldKey: AuditFieldKey,
  message: string,
  recommendation: string,
  requiresClientDecision = false
): void {
  findings.push({
    severity,
    type,
    fieldKey,
    message,
    recommendation,
    requiresClientDecision
  });
}

function getGrossMargin(price: number, cost: number): number {
  return (price - cost) / price;
}

function auditGeneralFields(
  product: ProductAuditSource,
  findings: NewAuditFinding[]
): void {
  const titleMissing =
    isMissing(product.draftData.title) ||
    product.title.startsWith("Produit sans titre - ligne");

  if (titleMissing) {
    addFinding(
      findings,
      "blocking",
      "missing",
      "title",
      "Le titre produit est manquant.",
      "Ajoutez un nom choisi par le client. Si le nom est artistique, conservez-le et ajoutez plutot un sous-titre descriptif.",
      true
    );
  }

  if (isMissing(product.description)) {
    addFinding(
      findings,
      "warning",
      "missing",
      "description",
      "La description est manquante.",
      "Ajoutez une description factuelle et concise sans effacer l intention creative."
    );
  }

  if (isMissing(product.category)) {
    addFinding(
      findings,
      "warning",
      "missing",
      "category",
      "La categorie est manquante.",
      "Indiquez une categorie simple pour adapter les controles techniques."
    );
  }

  if (isMissing(product.materials)) {
    addFinding(
      findings,
      "warning",
      "missing",
      "materials",
      "La matiere ou composition est manquante.",
      "Ajoutez uniquement les matieres connues et verifiees."
    );
  }

  if (isMissing(product.dimensions)) {
    addFinding(
      findings,
      "warning",
      "missing",
      "dimensions",
      "Les dimensions sont manquantes.",
      "Ajoutez les mesures disponibles ou signalez clairement qu elles restent a confirmer."
    );
  }

  if (product.currentPrice === null && product.desiredPrice === null) {
    addFinding(
      findings,
      "warning",
      "missing",
      "price",
      "Aucun prix actuel ou souhaite n est renseigne.",
      "Ajoutez au moins un prix de travail pour permettre une lecture commerciale."
    );
  }

  if (isMissing(product.imageUrl)) {
    addFinding(
      findings,
      "info",
      "recommended_missing",
      "image_url",
      "Aucune image principale n est renseignee.",
      "Ajoutez une image produit quand elle sera disponible."
    );
  }

  if (isMissing(product.sku)) {
    addFinding(
      findings,
      "info",
      "recommended_missing",
      "sku",
      "Aucune reference SKU n est renseignee.",
      "Ajoutez une reference si le catalogue en utilise une."
    );
  }

  if (isMissing(product.origin)) {
    addFinding(
      findings,
      "info",
      "recommended_missing",
      "origin",
      "L origine ou le lieu de fabrication n est pas renseigne.",
      "Ajoutez l origine uniquement si elle est connue et verifiable."
    );
  }
}

function auditLengthAndPlacement(
  product: ProductAuditSource,
  findings: NewAuditFinding[]
): void {
  if (product.title.length > 90) {
    addFinding(
      findings,
      "warning",
      "too_long",
      "title",
      "Le titre semble long pour une fiche produit.",
      "Gardez le nom principal lisible et placez les details dans le sous-titre ou la description."
    );
  }

  if (getText(product, "description").length > 900) {
    addFinding(
      findings,
      "warning",
      "too_long",
      "description",
      "La description est longue pour une premiere lecture.",
      "Conservez l intention, mais deplacez les details techniques dans des champs dedies si possible.",
      true
    );
  }

  if (
    isMissing(product.dimensions) &&
    includesAny(product.description, [" cm", "mm", "hauteur", "largeur"])
  ) {
    addFinding(
      findings,
      "info",
      "misplaced",
      "dimensions",
      "Des dimensions semblent presentes dans la description.",
      "Copiez les mesures dans le champ dimensions pour faciliter la lecture."
    );
  }

  if (
    isMissing(product.materials) &&
    includesAny(product.description, ["coton", "laine", "bois", "metal", "ceramique"])
  ) {
    addFinding(
      findings,
      "info",
      "misplaced",
      "materials",
      "Une matiere semble presente dans la description.",
      "Renseignez le champ matieres avec les informations verifiees."
    );
  }
}

function auditCategoryRules(
  product: ProductAuditSource,
  findings: NewAuditFinding[]
): void {
  const category = product.category;
  const text = `${product.description ?? ""} ${product.clientNotes ?? ""}`;

  if (!category) {
    return;
  }

  if (includesAny(category, ["vase"])) {
    if (!includesAny(text, ["eau", "etanche", "water"])) {
      addFinding(
        findings,
        "info",
        "recommended_missing",
        "usage",
        "L usage avec eau ou l etancheite n est pas precise.",
        "Ajoutez cette information si elle est connue."
      );
    }
    if (!includesAny(text, ["entretien", "nettoyage", "care"])) {
      addFinding(
        findings,
        "info",
        "recommended_missing",
        "client_notes",
        "L entretien du vase n est pas precise.",
        "Ajoutez une indication d entretien si elle existe."
      );
    }
    if (isMissing(product.origin)) {
      addFinding(
        findings,
        "warning",
        "recommended_missing",
        "origin",
        "L origine est utile pour justifier un positionnement premium.",
        "Ajoutez l origine uniquement si elle est verifiee."
      );
    }
  }

  if (includesAny(category, ["lampe"])) {
    for (const label of ["ampoule", "puissance", "norme electrique", "cable"]) {
      if (!includesAny(text, [label])) {
        addFinding(
          findings,
          "warning",
          "technical_required",
          "technical",
          `Information cruciale manquante pour une lampe : ${label}.`,
          "Ajoutez cette donnee technique si elle est connue, sinon signalez qu elle reste a confirmer."
        );
      }
    }
    if (!includesAny(text, ["interieur", "exterieur", "outdoor", "indoor"])) {
      addFinding(
        findings,
        "info",
        "recommended_missing",
        "usage",
        "L usage interieur ou exterieur n est pas precise.",
        "Ajoutez l usage recommande si cette information est verifiee."
      );
    }
  }

  if (includesAny(category, ["vetement", "habit", "clothing", "top", "pantalon", "veste", "manteau"])) {
    for (const label of ["composition", "taille", "coupe", "entretien", "guide de taille"]) {
      if (!includesAny(text, [label]) && isMissing(product.materials)) {
        addFinding(
          findings,
          "warning",
          "recommended_missing",
          "materials",
          `Information recommandee pour un vetement : ${label}.`,
          "Ajoutez cette information si elle existe dans le catalogue source."
        );
      }
    }
  }

  if (includesAny(category, ["bijou", "broche", "bracelet", "collier", "ring", "bague"])) {
    if (isMissing(product.materials)) {
      addFinding(
        findings,
        "warning",
        "recommended_missing",
        "materials",
        "La matiere est recommandee pour un bijou.",
        "Ajoutez la matiere verifiee, sans inventer d alliage ou certification."
      );
    }
    if (isMissing(product.dimensions)) {
      addFinding(
        findings,
        "warning",
        "recommended_missing",
        "dimensions",
        "Les dimensions ou le poids sont recommandes pour un bijou.",
        "Ajoutez la taille, le poids ou le systeme d attache si connu."
      );
    }
    if (!includesAny(text, ["entretien", "care"])) {
      addFinding(
        findings,
        "info",
        "recommended_missing",
        "client_notes",
        "L entretien du bijou n est pas precise.",
        "Ajoutez une recommandation d entretien si elle est connue."
      );
    }
  }
}

function auditPricing(
  product: ProductAuditSource,
  findings: NewAuditFinding[]
): void {
  if (product.desiredPrice !== null && product.costPrice === null) {
    addFinding(
      findings,
      "warning",
      "price_risk",
      "cost_price",
      "Prix souhaite present, mais cout de revient absent.",
      "Ajoutez le cout de revient pour verifier la marge. Fichr ne peut pas conclure sans cette donnee."
    );
  }

  if (product.costPrice !== null && product.currentPrice !== null) {
    const margin = getGrossMargin(product.currentPrice, product.costPrice);

    if (margin < 0.3) {
      addFinding(
        findings,
        "warning",
        "price_risk",
        "current_price",
        "La marge brute approximative du prix actuel semble inferieure a 30%.",
        "Verifiez le prix ou le cout de revient avant de presenter ce tarif comme robuste.",
        true
      );
    }
  }

  if (product.costPrice !== null && product.desiredPrice !== null) {
    if (product.desiredPrice <= product.costPrice) {
      addFinding(
        findings,
        "blocking",
        "price_risk",
        "desired_price",
        "Le prix souhaite est inferieur ou egal au cout de revient.",
        "Revoyez le prix souhaite ou le cout de revient avant validation.",
        true
      );
    } else if (getGrossMargin(product.desiredPrice, product.costPrice) < 0.3) {
      addFinding(
        findings,
        "warning",
        "price_risk",
        "desired_price",
        "La marge brute approximative du prix souhaite semble inferieure a 30%.",
        "Verifiez si ce prix est viable pour la marque.",
        true
      );
    }
  }

  if (
    product.currentPrice !== null &&
    product.desiredPrice !== null &&
    product.desiredPrice >= product.currentPrice * 1.5
  ) {
    addFinding(
      findings,
      "info",
      "price_risk",
      "desired_price",
      "Le prix souhaite est nettement superieur au prix actuel.",
      "Ce positionnement peut etre ambitieux ; renforcez les informations de valeur avant usage commercial.",
      true
    );
  }
}

function calculateScore(findings: NewAuditFinding[]): number {
  const score = findings.reduce((currentScore, finding) => {
    if (finding.severity === "blocking") {
      return currentScore - 25;
    }

    if (finding.severity === "warning") {
      return currentScore - 8;
    }

    return currentScore - 3;
  }, 100);

  return Math.max(0, Math.min(100, score));
}

function createFindings(product: ProductAuditSource): NewAuditFinding[] {
  const findings: NewAuditFinding[] = [];

  auditGeneralFields(product, findings);
  auditLengthAndPlacement(product, findings);
  auditCategoryRules(product, findings);
  auditPricing(product, findings);

  return findings;
}

function toProductAuditSource(
  productId: string,
  workspaceId: string
): ProductAuditSource | null {
  const product = db
    .select()
    .from(products)
    .where(
      and(
        eq(products.id, productId),
        eq(products.workspaceId, workspaceId),
        isNull(products.deletedAt)
      )
    )
    .limit(1)
    .get();

  if (!product) {
    return null;
  }

  return {
    id: product.id,
    workspaceId: product.workspaceId,
    deletedAt: product.deletedAt,
    deletedReason: product.deletedReason,
    title: product.title,
    subtitle: product.subtitle,
    category: product.category,
    description: product.description,
    materials: product.materials,
    dimensions: product.dimensions,
    origin: product.origin,
    currentPrice: product.currentPrice,
    desiredPrice: product.desiredPrice,
    costPrice: product.costPrice,
    targetMargin: product.targetMargin,
    sku: product.sku,
    spaceId: product.spaceId,
    spaceArchivedAt: null,
    spaceName: null,
    imageUrl: product.imageUrl,
    clientNotes: product.clientNotes,
    status: product.status,
    importId: product.importId,
    draftData: product.draftData,
    rawData: product.rawData,
    validatedData: product.validatedData
  };
}

function getAuditWithFindings(audit: typeof productAudits.$inferSelect): ProductAudit {
  const findings = db
    .select()
    .from(auditFindings)
    .where(
      and(
        eq(auditFindings.auditId, audit.id),
        eq(auditFindings.workspaceId, audit.workspaceId)
      )
    )
    .all()
    .map<AuditFinding>((finding) => ({
      id: finding.id,
      severity: finding.severity,
      type: finding.type,
      fieldKey: finding.fieldKey,
      message: finding.message,
      recommendation: finding.recommendation,
      requiresClientDecision: finding.requiresClientDecision
    }));

  return {
    id: audit.id,
    productId: audit.productId,
    status: audit.status,
    score: audit.score,
    createdAt: audit.createdAt,
    findings
  };
}

export async function getCurrentProductAudit(
  productId: string
): Promise<ProductAudit | null> {
  const access = await requireWorkspaceAccess(auditReadRoles);
  const audit = db
    .select()
    .from(productAudits)
    .where(
      and(
        eq(productAudits.productId, productId),
        eq(productAudits.workspaceId, access.workspaceId),
        eq(productAudits.status, "current")
      )
    )
    .orderBy(desc(productAudits.updatedAt), desc(productAudits.createdAt))
    .limit(1)
    .get();

  if (!audit) {
    return null;
  }

  return getAuditWithFindings(audit);
}

export async function getLatestProductAudit(
  productId: string
): Promise<ProductAudit | null> {
  const access = await requireWorkspaceAccess(auditReadRoles);
  const currentAudit = await getCurrentProductAudit(productId);

  if (currentAudit) {
    return currentAudit;
  }

  const audit = db
    .select()
    .from(productAudits)
    .where(
      and(
        eq(productAudits.productId, productId),
        eq(productAudits.workspaceId, access.workspaceId)
      )
    )
    .orderBy(desc(productAudits.updatedAt), desc(productAudits.createdAt))
    .limit(1)
    .get();

  return audit ? getAuditWithFindings(audit) : null;
}

export async function runDeterministicProductAudit(
  productId: string
): Promise<ProductAudit> {
  const access = await requireWorkspaceAccess(auditWriteRoles);
  const product = toProductAuditSource(productId, access.workspaceId);

  if (!product || product.workspaceId !== access.workspaceId) {
    throw new Error("Product not found for this workspace.");
  }

  const findings = createFindings(product);
  const score = calculateScore(findings);
  const auditId = createServerId("aud");

  db.transaction((tx) => {
    tx.update(productAudits)
      .set({
        status: "stale",
        updatedAt: sql`CURRENT_TIMESTAMP`
      })
      .where(
        and(
          eq(productAudits.productId, productId),
          eq(productAudits.workspaceId, access.workspaceId),
          eq(productAudits.status, "current")
        )
      )
      .run();

    tx.insert(productAudits)
      .values({
        id: auditId,
        workspaceId: access.workspaceId,
        productId,
        status: "current",
        score
      })
      .run();

    if (findings.length > 0) {
      tx.insert(auditFindings)
        .values(
          findings.map((finding) => ({
            id: createServerId("find"),
            workspaceId: access.workspaceId,
            productId,
            auditId,
            severity: finding.severity,
            type: finding.type,
            fieldKey: finding.fieldKey,
            message: finding.message,
            recommendation: finding.recommendation,
            requiresClientDecision: finding.requiresClientDecision
          }))
        )
        .run();
    }
  });

  logEvent({
    workspaceId: access.workspaceId,
    actorUserId: access.userId,
    action: "product.audit.run",
    entityType: "product",
    entityId: productId,
    metadata: {
      product_id: productId,
      audit_id: auditId,
      score,
      finding_count: findings.length
    }
  });

  return (await getCurrentProductAudit(productId)) as ProductAudit;
}
