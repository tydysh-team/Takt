import type { RoleCode } from "../api/types";

export function roleLabel(role: RoleCode): string {
  const labels: Record<RoleCode, string> = {
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
  return [person.first_name, person.last_name].map((part) => part.trim()).filter(Boolean).join(" ");
}

export function formatFullName(person: { first_name: string; last_name: string; middle_name?: string | null }): string {
  return [person.last_name, person.first_name, person.middle_name]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
}
