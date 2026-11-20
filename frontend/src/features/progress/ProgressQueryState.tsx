import type { ReactNode } from "react";

import { readableError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { Alert, ErrorState, LoadingState } from "../../components/ui/Feedback";

interface ProgressQueryStateProps {
  isLoading: boolean;
  isError: boolean;
  hasData?: boolean;
  error: unknown;
  onRetry: () => void;
  children: ReactNode;
}

export function ProgressQueryState({
  isLoading,
  isError,
  hasData = false,
  error,
  onRetry,
  children,
}: ProgressQueryStateProps) {
  if (isLoading) return <LoadingState label="Считаем статистику…" />;
  if (isError && !hasData) return <ErrorState message={readableError(error)} onRetry={onRetry} />;
  return <>
    {isError ? <Alert tone="error">Не удалось обновить данные. <Button type="button" variant="secondary" onClick={onRetry}>Повторить</Button></Alert> : null}
    {children}
  </>;
}
