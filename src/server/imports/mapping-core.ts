import {
  importMappingFieldKeys,
  type ColumnMapping,
  type ImportMappingFieldKey
} from "../../types/import.ts";

const columnAliases: Record<ImportMappingFieldKey, string[]> = {
  title: ["title", "name", "product name", "nom", "nom produit", "produit"],
  subtitle: ["subtitle", "sous titre", "accroche"],
  category: ["category", "type", "categorie"],
  description: ["description", "body", "texte", "product description"],
  materials: ["material", "materials", "matiere", "matieres", "composition"],
  dimensions: ["dimensions", "size", "taille", "mesures"],
  origin: ["origin", "origine", "made in", "fabrication"],
  current_price: ["price", "prix", "current price", "prix actuel"],
  desired_price: [
    "desired price",
    "target price",
    "prix souhaite",
    "prix voulu"
  ],
  cost_price: ["cost", "cost price", "cout", "cout revient", "prix de revient"],
  target_margin: ["margin", "marge", "marge cible"],
  sku: ["sku", "reference", "ref"],
  image_url: ["image", "image url", "photo", "visuel"],
  client_notes: ["notes", "commentaire", "remarques", "intention"],
  space_name: [
    "espace",
    "space",
    "collection",
    "projet",
    "project",
    "gamme",
    "dossier",
    "folder"
  ]
};

function normalizeColumnName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function suggestColumnMapping(columns: string[]): ColumnMapping {
  const normalizedColumns = columns.map((column) => ({
    column,
    normalized: normalizeColumnName(column)
  }));
  const usedColumns = new Set<string>();
  const mapping: ColumnMapping = {};

  for (const field of importMappingFieldKeys) {
    const aliases = columnAliases[field];
    const match = normalizedColumns.find(
      ({ column, normalized }) =>
        !usedColumns.has(column) && aliases.includes(normalized)
    );

    if (match) {
      mapping[field] = match.column;
      usedColumns.add(match.column);
    }
  }

  return mapping;
}
