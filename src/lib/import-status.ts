import type {
  ImportCreationPreflightStatus,
  ImportStatus
} from "@/types/import";

const importStatusLabels: Record<ImportStatus, string> = {
  uploaded: "Fichier importé",
  parsed: "Mapping à valider",
  mapped: "Mapping validé",
  processed: "Brouillons créés",
  failed: "Erreur à corriger"
};

export function getImportStatusLabel(status: ImportStatus): string {
  return importStatusLabels[status];
}

export type ImportFlowStepState =
  | "complete"
  | "current"
  | "blocked"
  | "pending"
  | "ready";

export type ImportFlowStep = {
  detail: string;
  label: string;
  state: ImportFlowStepState;
};

export function getImportPreflightStatusLabel(
  status: ImportCreationPreflightStatus
): string {
  if (status === "already_processed") {
    return "Brouillons créés";
  }

  if (status === "ready") {
    return "Prêt à créer";
  }

  if (status === "mapping_required") {
    return "Mapping à valider";
  }

  return status === "failed" ? "Erreur à corriger" : "Bloqué";
}

export function getImportFlowSteps(
  importStatus: ImportStatus,
  preflightStatus: ImportCreationPreflightStatus
): ImportFlowStep[] {
  const failed = importStatus === "failed";
  const mapped = importStatus === "mapped" || importStatus === "processed";
  const processed = importStatus === "processed";
  const preflightBlocked =
    preflightStatus === "blocked" || preflightStatus === "failed";

  return [
    {
      detail: failed ? "Erreur à corriger" : "Terminé",
      label: "Fichier importé",
      state: failed ? "blocked" : "complete"
    },
    {
      detail: mapped
        ? "Mapping validé"
        : failed
          ? "Bloqué"
          : "Mapping à valider",
      label: "Mapping",
      state: mapped ? "complete" : failed ? "blocked" : "current"
    },
    {
      detail: processed
        ? "Terminé"
        : preflightStatus === "ready"
          ? "Création prête"
          : preflightBlocked
            ? "Bloqué"
            : "En attente",
      label: "Préparation",
      state: processed
        ? "complete"
        : preflightStatus === "ready"
          ? "ready"
          : preflightBlocked
            ? "blocked"
            : "pending"
    },
    {
      detail: processed
        ? "Brouillons créés"
        : preflightStatus === "ready"
          ? "Prêt"
          : preflightBlocked
            ? "À corriger"
            : "En attente",
      label: "Création des brouillons",
      state: processed
        ? "complete"
        : preflightStatus === "ready"
          ? "current"
          : preflightBlocked
            ? "blocked"
            : "pending"
    }
  ];
}
