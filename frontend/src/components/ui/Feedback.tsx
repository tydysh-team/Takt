import { Button } from "./Button";

export function LoadingState({ label = "Загрузка…" }: { label?: string }) {
  return (
    <div className="state-card" role="status">
      <span className="loader" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="state-card state-card--empty">
      <span className="state-card__icon" aria-hidden="true">○</span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state-card state-card--error" role="alert">
      <h2>Что-то пошло не так</h2>
      <p>{message}</p>
      {onRetry ? <Button variant="secondary" onClick={onRetry}>Повторить</Button> : null}
    </div>
  );
}

export function Alert({ children, tone = "success" }: React.PropsWithChildren<{ tone?: "success" | "error" | "info" }>) {
  return <div className={`alert alert--${tone}`} role={tone === "error" ? "alert" : "status"}>{children}</div>;
}
