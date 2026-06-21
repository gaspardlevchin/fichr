"use client";

import type { MouseEvent, ReactNode } from "react";

type TargetedActionLinkProps = {
  children: ReactNode;
  className?: string;
  targetId: string;
};

export function TargetedActionLink({
  children,
  className,
  targetId
}: TargetedActionLinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    const target = document.getElementById(targetId);

    if (!target) {
      return;
    }

    event.preventDefault();
    window.history.pushState(null, "", `#${targetId}`);

    const highlightTarget =
      target.closest(".targetable-field, .targetable-section") ?? target;
    const focusTarget =
      target.matches("input, textarea, select, button, [tabindex]")
        ? target
        : target.querySelector<HTMLElement>(
            "input, textarea, select, button, [tabindex]"
          );

    highlightTarget.classList.remove("target-navigation-highlight");
    window.requestAnimationFrame(() => {
      highlightTarget.classList.add("target-navigation-highlight");
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      focusTarget?.focus({ preventScroll: true });

      window.setTimeout(() => {
        highlightTarget.classList.remove("target-navigation-highlight");
      }, 1800);
    });
  }

  return (
    <a
      aria-controls={targetId}
      className={className}
      href={`#${targetId}`}
      onClick={handleClick}
    >
      {children}
    </a>
  );
}
