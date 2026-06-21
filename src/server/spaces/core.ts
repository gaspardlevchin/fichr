const MAX_SPACE_NAME_LENGTH = 80;
const MAX_SPACE_DESCRIPTION_LENGTH = 240;

export function normalizeSpaceName(value: string): string {
  const name = value.trim().replace(/\s+/g, " ");

  if (!name) {
    throw new Error("Le nom de l’espace est obligatoire.");
  }

  if (name.length > MAX_SPACE_NAME_LENGTH) {
    throw new Error(
      `Le nom de l’espace est limité à ${MAX_SPACE_NAME_LENGTH} caractères.`
    );
  }

  return name;
}

export function normalizeSpaceDescription(value: string): string | null {
  const description = value.trim().replace(/\s+/g, " ");

  if (description.length > MAX_SPACE_DESCRIPTION_LENGTH) {
    throw new Error(
      `La description est limitée à ${MAX_SPACE_DESCRIPTION_LENGTH} caractères.`
    );
  }

  return description || null;
}

export function normalizeImportedSpaceName(value: string): string | null {
  const name = value.trim().replace(/\s+/g, " ");

  return name ? name.slice(0, MAX_SPACE_NAME_LENGTH) : null;
}
