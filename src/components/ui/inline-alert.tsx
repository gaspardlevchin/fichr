import type { ReactNode } from "react";

export function InlineAlert({
  children,
  variant = "info"
}: {
  children: ReactNode;
  variant?: "error" | "info" | "success";
}) {
  return (
    <p
      className={`${variant === "info" ? "notice-text" : `${variant}-text`} inline-alert`}
      role={variant === "error" ? "alert" : "status"}
    >
      {children}
    </p>
  );
}
