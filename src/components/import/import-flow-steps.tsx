import { UiIcon } from "@/components/ui/ui-icon";
import {
  getImportFlowSteps,
  type ImportFlowStepState
} from "@/lib/import-status";
import type {
  ImportCreationPreflight,
  ImportStatus
} from "@/types/import";

function getStateIcon(state: ImportFlowStepState) {
  if (state === "complete" || state === "ready") {
    return "circle-check" as const;
  }

  if (state === "blocked") {
    return "alert" as const;
  }

  return "clock" as const;
}

export function ImportFlowSteps({
  importStatus,
  preflight
}: {
  importStatus: ImportStatus;
  preflight: ImportCreationPreflight;
}) {
  const steps = getImportFlowSteps(importStatus, preflight.status);

  return (
    <nav className="import-flow" aria-label="Étapes de l’import">
      <ol>
        {steps.map((step, index) => (
          <li
            aria-current={step.state === "current" ? "step" : undefined}
            className={`import-flow-step import-flow-step-${step.state}`}
            key={step.label}
          >
            <span className="import-flow-number" aria-hidden="true">
              {index + 1}
            </span>
            <span className="import-flow-icon" aria-hidden="true">
              <UiIcon name={getStateIcon(step.state)} size={16} />
            </span>
            <span className="import-flow-copy">
              <strong>{step.label}</strong>
              <span className="import-flow-status">{step.detail}</span>
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
