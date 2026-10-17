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

  useEffect(() => {
    if (!open) return;
    if (variant === "lesson") dialogRef.current?.focus();
    else closeRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("keydown", closeOnEscape); };
  }, [open, onClose, variant]);

  useEffect(() => {
    if (!open || variant !== "lesson") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open, variant]);

  if (!open) return null;

  return (
    <div className={`dialog-backdrop${variant === "lesson" ? " dialog-backdrop--lesson" : ""}`} onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className={`dialog-frame${variant === "lesson" ? " dialog-frame--lesson" : ""}`}>
        {variant === "default" ? <div className="dialog-close-row">
          <Button ref={closeRef} variant="ghost" className="icon-button dialog-close" onClick={onClose} aria-label="Закрыть">
            ×
          </Button>
        </div> : null}
        <section ref={dialogRef} className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabIndex={variant === "lesson" ? -1 : undefined}>
          {variant === "default" ? <header className="dialog__header">
            <div>
              <h2 id="dialog-title">{title}</h2>
              {description ? <p>{description}</p> : null}
            </div>
          </header> : null}
          <div className="dialog__content">{children}</div>
        </section>
      </div>
    </div>
  );
}
