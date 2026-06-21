"use client";

import { UiIcon } from "@/components/ui/ui-icon";
import { deleteCatalogExportAction } from "@/server/exports/actions";

export function DeleteExportForm({ exportId }: { exportId: string }) {
  return (
    <form
      action={deleteCatalogExportAction}
      onSubmit={(event) => {
        if (!window.confirm("Supprimer cet export ?")) {
          event.preventDefault();
        }
      }}
    >
      <input name="exportId" type="hidden" value={exportId} />
      <button className="danger-button" type="submit">
        <UiIcon name="trash" />
        Supprimer
      </button>
    </form>
  );
}
