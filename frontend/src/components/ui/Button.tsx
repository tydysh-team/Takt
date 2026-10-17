import { forwardRef, type ButtonHTMLAttributes, type PropsWithChildren } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, PropsWithChildren<ButtonProps>>(
  function Button(
    { children, className = "", variant = "primary", loading = false, disabled, ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        className={`button button--${variant} ${className}`.trim()}
        disabled={Boolean(disabled) || loading}
        {...props}
      >
        {loading ? <span className="button__spinner" aria-hidden="true" /> : null}
        {loading ? "Подождите…" : children}
      </button>
    );
  },
);
