import { useEffect, useRef, type PropsWithChildren } from "react";

import { Button } from "./Button";

interface DrawerProps extends PropsWithChildren {
  open: boolean;
  eyebrow?: string;
  title: string;
  description?: string | undefined;
  onClose: () => void;
}

export function Drawer({ open, eyebrow, title, description, onClose, children }: DrawerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", closeOnEscape);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
      previouslyFocused.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="drawer-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <header className="drawer__header">
          <div>
            {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
            <h2 id="drawer-title">{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <Button ref={closeRef} variant="ghost" className="icon-button control-icon-button drawer__close" onClick={onClose} aria-label="Закрыть панель">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </Button>
        </header>
        <div className="drawer__content">{children}</div>
      </aside>
    </div>
  );
}
