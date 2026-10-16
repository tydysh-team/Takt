import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

interface FieldShellProps {
  label: string;
  name: string;
  error?: string | undefined;
  hint?: string | undefined;
}

function FieldShell({ label, name, error, hint, children }: React.PropsWithChildren<FieldShellProps>) {
  const descriptionId = error || hint ? `${name}-description` : undefined;
  return (
    <div className="form-field">
      <label htmlFor={name}>{label}</label>
      {children}
      {error ? (
        <span className="form-field__error" id={descriptionId} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="form-field__hint" id={descriptionId}>{hint}</span>
      ) : null}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, id, name, className = "", ...props },
  ref,
) {
  const fieldName = id ?? name ?? "field";
  return (
    <FieldShell label={label} name={fieldName} error={error} hint={hint}>
      <input
        ref={ref}
        id={fieldName}
        name={name}
        className={`input ${className}`.trim()}
        aria-invalid={Boolean(error)}
        aria-describedby={error || hint ? `${fieldName}-description` : undefined}
        {...props}
      />
    </FieldShell>
  );
});

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string | undefined;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, id, name, className = "", children, ...props },
  ref,
) {
  const fieldName = id ?? name ?? "field";
  return (
    <FieldShell label={label} name={fieldName} error={error}>
      <select
        ref={ref}
        id={fieldName}
        name={name}
        className={`input ${className}`.trim()}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${fieldName}-description` : undefined}
        {...props}
      >
        {children}
      </select>
    </FieldShell>
  );
});

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, hint, id, name, className = "", ...props },
  ref,
) {
  const fieldName = id ?? name ?? "field";
  return (
    <FieldShell label={label} name={fieldName} error={error} hint={hint}>
      <textarea
        ref={ref}
        id={fieldName}
        name={name}
        className={`input textarea ${className}`.trim()}
        aria-invalid={Boolean(error)}
        aria-describedby={error || hint ? `${fieldName}-description` : undefined}
        {...props}
      />
    </FieldShell>
  );
});
