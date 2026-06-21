"use client";

import { UiIcon } from "@/components/ui/ui-icon";

type FieldJumpButtonProps = {
  targetId: string;
};

export function FieldJumpButton({ targetId }: FieldJumpButtonProps) {
  function handleClick() {
    const target = document.getElementById(targetId);

    if (!target) {
      return;
    }

    const highlightTarget = target.closest(".form-field") ?? target;

    highlightTarget.classList.remove("field-jump-highlight");
    window.requestAnimationFrame(() => {
      highlightTarget.classList.add("field-jump-highlight");
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.focus({ preventScroll: true });

      window.setTimeout(() => {
        highlightTarget.classList.remove("field-jump-highlight");
      }, 1800);
    });
  }

  return (
    <button
      aria-controls={targetId}
      className="field-jump-button"
      onClick={handleClick}
      type="button"
    >
      Corriger ce champ
      <UiIcon name="arrow-right" />
    </button>
  );
}
