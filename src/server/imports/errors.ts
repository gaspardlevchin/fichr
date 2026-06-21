export class ImportFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportFlowError";
  }
}

export class CsvImportValidationError extends ImportFlowError {
  constructor(message: string) {
    super(message);
    this.name = "CsvImportValidationError";
  }
}

export class ImportQuotaExceededError extends ImportFlowError {
  constructor(message: string) {
    super(message);
    this.name = "ImportQuotaExceededError";
  }
}

export class ImportMappingIncompleteError extends ImportFlowError {
  constructor(message: string) {
    super(message);
    this.name = "ImportMappingIncompleteError";
  }
}

export class ImportStorageError extends ImportFlowError {
  constructor(
    message = "Le fichier CSV n’a pas pu être enregistré dans le stockage local."
  ) {
    super(message);
    this.name = "ImportStorageError";
  }
}

export class ImportRowsInvalidError extends ImportFlowError {
  constructor(message: string) {
    super(message);
    this.name = "ImportRowsInvalidError";
  }
}

export class ImportWorkspaceForbiddenError extends ImportFlowError {
  constructor(
    message = "Import introuvable ou inaccessible dans ce workspace."
  ) {
    super(message);
    this.name = "ImportWorkspaceForbiddenError";
  }
}

export class ImportEntitlementError extends ImportFlowError {
  constructor(message: string) {
    super(message);
    this.name = "ImportEntitlementError";
  }
}

export class ImportDraftCreationError extends ImportFlowError {
  constructor(
    message = "Les produits brouillons n’ont pas pu être créés. Aucune création partielle n’a été conservée."
  ) {
    super(message);
    this.name = "ImportDraftCreationError";
  }
}

export function getImportActionErrorMessage(error: unknown): string {
  if (error instanceof ImportFlowError) {
    return error.message;
  }

  return "L’import n’a pas pu être terminé. Réessayez ou consultez le détail de l’import.";
}
