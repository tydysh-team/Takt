import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import { createPortal } from "react-dom";

import { ToastContext, type ToastOptions, type ToastTone } from "./toast-context";

interface ToastItem {
  id: number;
  key: string;
  message: string;
  tone: ToastTone;
  version: number;
  closing: boolean;
}

const exitDuration = 180;
const lifetimes: Record<ToastTone, number> = { success: 5000, info: 5000, warning: 10000, error: 10000 };

function ToastCard({ toast, dismiss, remove }: {
  toast: ToastItem;
  dismiss: (id: number) => void;
  remove: (id: number) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const remaining = useRef(lifetimes[toast.tone]);
  const paused = hovered || focused;

  useEffect(() => { remaining.current = lifetimes[toast.tone]; }, [toast.version, toast.tone]);
  useEffect(() => {
    if (paused || toast.closing) return;
    const started = Date.now();
    const timer = window.setTimeout(() => { dismiss(toast.id); }, remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - started));
    };
  }, [paused, toast.closing, toast.id, toast.version, toast.tone, dismiss]);
  useEffect(() => {
    if (!toast.closing) return;
    const timer = window.setTimeout(() => { remove(toast.id); }, exitDuration);
    return () => { window.clearTimeout(timer); };
  }, [toast.closing, toast.id, remove]);

  return <div className={`toast toast--${toast.tone}${toast.closing ? " toast--closing" : ""}`}
    role={toast.tone === "error" ? "alert" : "status"} aria-atomic="true"
    onMouseEnter={() => { setHovered(true); }} onMouseLeave={() => { setHovered(false); }}
    onFocus={() => { setFocused(true); }} onBlur={(event) => {
      if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setFocused(false);
    }}>
    <svg className="toast__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d={toast.tone === "success" ? "m8 12 3 3 5-6" : toast.tone === "info" ? "M12 11v6M12 7h.01" : "M12 7v6M12 17h.01"} />
    </svg>
    <span className="toast__message">{toast.message}</span>
    <button type="button" className="toast__close" aria-label="Закрыть уведомление" disabled={toast.closing} onClick={() => { dismiss(toast.id); }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg>
    </button>
  </div>;
}

export function ToastProvider({ children }: PropsWithChildren) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const notify = useCallback((message: string, options: ToastOptions = {}) => {
    const tone = options.tone ?? "success";
    const key = options.key ?? `${tone}:${message}`;
    const id = ++nextId.current;
    setItems((current) => {
      if (current.some((item) => item.key === key)) {
        return current.map((item) => item.key === key
          ? { ...item, message, tone, version: item.version + 1, closing: false } : item);
      }
      return [...current, { id, key, message, tone, version: 0, closing: false }].slice(-3);
    });
  }, []);
  const dismiss = useCallback((id: number) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, closing: true } : item));
  }, []);
  const remove = useCallback((id: number) => { setItems((current) => current.filter((item) => item.id !== id)); }, []);
  const context = useMemo(() => ({ notify }), [notify]);

  return <ToastContext.Provider value={context}>
    {children}
    {typeof document === "undefined" ? null : createPortal(
      <div className="toast-stack" role="region" aria-label="Уведомления">
        {items.map((toast) => <ToastCard key={toast.id} toast={toast} dismiss={dismiss} remove={remove} />)}
      </div>, document.body,
    )}
  </ToastContext.Provider>;
}
