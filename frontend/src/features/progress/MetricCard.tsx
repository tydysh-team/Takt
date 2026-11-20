interface MetricCardProps {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "danger";
}

export function MetricCard({ label, value, hint, tone = "default" }: MetricCardProps) {
  return (
    <div className={`progress-metric${tone === "danger" ? " progress-metric--danger" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}
