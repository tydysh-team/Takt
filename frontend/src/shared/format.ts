import type { UserRole } from "../api/types";

export function roleLabel(role: UserRole): string {
  const labels: Record<UserRole, string> = {
    TEACHER: "Преподаватель",
    STUDENT: "Ученик",
    ADMIN: "Администратор",
  };
  return labels[role];
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function fullName(person: { first_name: string; last_name: string }): string {
  return `${person.first_name} ${person.last_name}`;
}
