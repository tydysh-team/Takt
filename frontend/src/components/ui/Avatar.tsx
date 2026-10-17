function initials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

export function Avatar({ firstName, lastName, size = "medium" }: { firstName: string; lastName: string; size?: "small" | "medium" | "large" }) {
  return <span className={`avatar avatar--${size}`} aria-hidden="true">{initials(firstName, lastName)}</span>;
}
