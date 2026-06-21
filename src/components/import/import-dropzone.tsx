"use client";

import { useState } from "react";

import styles from "@/components/import/import-dropzone.module.css";
import { UiIcon } from "@/components/ui/ui-icon";
import { importCsvAction } from "@/server/imports/actions";
import { MAX_CSV_IMPORT_BYTES } from "@/server/imports/csv-parser";

const maxCsvSizeMb = MAX_CSV_IMPORT_BYTES / 1024 / 1024;

export function ImportDropzone() {
  const [filename, setFilename] = useState("");

  return (
    <form
      action={importCsvAction}
      className="import-form content-card"
      id="import-csv"
    >
      <div className="content-card-inner import-form-inner">
        <div className={styles.fileField}>
          <span className="form-label">Fichier CSV</span>
          <label className={styles.fileControl} htmlFor="csvFile">
            <span className={styles.fileAction}>
              <UiIcon name="upload" />
              Choisir un CSV
            </span>
            <span className={styles.filename} aria-live="polite">
              {filename || "Aucun fichier sélectionné"}
            </span>
            <input
              accept=".csv,text/csv"
              className={styles.input}
              id="csvFile"
              name="csvFile"
              onChange={(event) =>
                setFilename(event.currentTarget.files?.[0]?.name ?? "")
              }
              required
              type="file"
            />
          </label>
        </div>
        <p className="muted-text">
          CSV uniquement. Taille maximale : {maxCsvSizeMb} MB. Le fichier reste
          stocké localement.
        </p>
        <button className="primary-button" type="submit">
          <UiIcon name="upload" />
          Importer le CSV
        </button>
      </div>
    </form>
  );
}
