import { useEffect, useRef, type PropsWithChildren } from "react";

import { Button } from "./Button";

interface DialogProps extends PropsWithChildren {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  variant?: "default" | "lesson";
}

export function Dialog({ open, title, description, onClose, children, variant = "default" }: DialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (variant === "lesson") dialogRef.current?.focus();
    else closeRef.current?.focus();
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
  }, [open, variant]);

  if (!open) return null;

  return (
    <div className={`dialog-backdrop${variant === "lesson" ? " dialog-backdrop--lesson" : ""}`} onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className={`dialog-frame${variant === "lesson" ? " dialog-frame--lesson" : ""}`}>
        <section ref={dialogRef} className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabIndex={variant === "lesson" ? -1 : undefined}>
          {variant === "default" ? <header className="dialog__header">
            <div>
              <h2 id="dialog-title">{title}</h2>
              {description ? <p>{description}</p> : null}
            </div>
            <Button ref={closeRef} variant="ghost" className="icon-button control-icon-button dialog-close" onClick={onClose} aria-label="Закрыть">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </Button>
          </header> : null}
          <div className="dialog__content">{children}</div>
        </section>
      </div>
    </div>
  );
}
