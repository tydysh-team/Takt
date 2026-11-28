import { createContext, useContext } from "react";

export type ToastTone = "success" | "info" | "warning" | "error";
export interface ToastOptions {
  tone?: ToastTone;
  key?: string;
}

export const ToastContext = createContext<{ notify: (message: string, options?: ToastOptions) => void } | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast requires ToastProvider");
  return context;
}
