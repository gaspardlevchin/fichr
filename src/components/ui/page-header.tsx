import type { ReactNode } from "react";

export function PageHeader({
  actions,
  back,
  description,
  eyebrow,
  title,
  titleId
}: {
  actions?: ReactNode;
  back?: ReactNode;
  description: string;
  eyebrow: string;
  title: string;
  titleId: string;
}) {
  return (
    <section
      className={`page-heading ${actions ? "page-heading-with-actions" : ""}`}
      aria-labelledby={titleId}
    >
      <div className="page-heading-content">
        {back}
        <p className="eyebrow">{eyebrow}</p>
        <h1 id={titleId}>{title}</h1>
        <p className="muted-text">{description}</p>
      </div>
      {actions ? <div className="page-heading-actions">{actions}</div> : null}
    </section>
  );
}
