type ProgressBarProps = {
  detail?: string;
  label: string;
  value: number;
};

export function ProgressBar({ detail, label, value }: ProgressBarProps) {
  const safeValue = Math.max(0, Math.min(100, Math.round(value)));
  const tone =
    safeValue >= 80 ? "progress-high" : safeValue >= 45 ? "progress-medium" : "progress-low";

  return (
    <div className="progress-block">
      <div className="progress-heading">
        <span>{label}</span>
        <span>{detail ?? `${safeValue} %`}</span>
      </div>
      <div
        aria-label={label}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={safeValue}
        className="progress-track"
        role="progressbar"
      >
        <span
          className={`progress-fill ${tone}`}
          style={{ width: `${safeValue}%` }}
        />
      </div>
    </div>
  );
}
