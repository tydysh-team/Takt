import type { ReactNode } from "react";

import { readableError } from "../../api/client";
import { ErrorState, LoadingState } from "../../components/ui/Feedback";

interface ProgressQueryStateProps {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  children: ReactNode;
}

export function ProgressQueryState({
  isLoading,
  isError,
  error,
  onRetry,
  children,
}: ProgressQueryStateProps) {
  if (isLoading) return <LoadingState label="Считаем статистику…" />;
  if (isError) return <ErrorState message={readableError(error)} onRetry={onRetry} />;
  return <>{children}</>;
}
