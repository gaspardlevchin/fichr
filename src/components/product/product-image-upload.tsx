"use client";

import { useState } from "react";

import styles from "@/components/product/product-image-upload.module.css";
import { UiIcon } from "@/components/ui/ui-icon";
import { replaceProductImageAction } from "@/server/products/actions";

type ProductImageUploadProps = {
  mode: "add" | "replace";
  productId: string;
};

export function ProductImageUpload({
  mode,
  productId
}: ProductImageUploadProps) {
  const [filename, setFilename] = useState("");
  const actionLabel =
    mode === "add" ? "Ajouter une image" : "Remplacer l’image";

  return (
    <form
      action={replaceProductImageAction}
      className={`${styles.form} media-upload-form`}
    >
      <input name="productId" type="hidden" value={productId} />
      <label className={`${styles.trigger} media-file-trigger`}>
        <input
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          className={`${styles.input} media-file-input`}
          name="image"
          onChange={(event) =>
            setFilename(event.currentTarget.files?.[0]?.name ?? "")
          }
          required
          type="file"
        />
        <UiIcon name="upload" />
        <span>{actionLabel}</span>
      </label>
      <span className={`${styles.filename} media-file-name`} aria-live="polite">
        {filename || "Aucun fichier sélectionné"}
      </span>
      <button
        className={`${styles.submit} primary-button media-submit-button`}
        type="submit"
      >
        <UiIcon name="check" />
        Enregistrer l’image
      </button>
      <small className={`${styles.hint} media-format-hint`}>
        JPG, PNG ou WEBP, 5 Mo maximum
      </small>
    </form>
  );
}
