import { useEffect, useRef, type PropsWithChildren } from "react";

import { Button } from "./Button";

interface DialogProps extends PropsWithChildren {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
}

export function Dialog({ open, title, description, onClose, children }: DialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("keydown", closeOnEscape); };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className="dialog-frame">
        <div className="dialog-close-row">
          <Button ref={closeRef} variant="ghost" className="icon-button dialog-close" onClick={onClose} aria-label="Закрыть">
            ×
          </Button>
        </div>
        <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
          <header className="dialog__header">
            <div>
              <h2 id="dialog-title">{title}</h2>
              {description ? <p>{description}</p> : null}
            </div>
          </header>
          <div className="dialog__content">{children}</div>
        </section>
      </div>
    </div>
  );
}
