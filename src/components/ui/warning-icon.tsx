type WarningIconProps = {
  className?: string;
};

export function WarningIcon({ className = "" }: WarningIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={`warning-icon ${className}`.trim()}
      focusable="false"
      viewBox="0 0 32 32"
    >
      <path
        d="M14.1 4.8c.8-1.4 3-1.4 3.8 0l11 20.2c.8 1.4-.2 3.2-1.9 3.2H5c-1.7 0-2.7-1.8-1.9-3.2L14.1 4.8Z"
        fill="currentColor"
        stroke="var(--fichr-warning-border)"
        strokeLinejoin="round"
        strokeWidth="1.2"
      />
      <path
        d="M16 12v7"
        stroke="var(--fichr-text)"
        strokeLinecap="round"
        strokeWidth="2.4"
      />
      <circle cx="16" cy="23.2" fill="var(--fichr-text)" r="1.45" />
    </svg>
  );
}
