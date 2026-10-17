import type { ApplicationRole, CurrentUser, RoleCode } from "../../api/types";

export function hasRole(user: Pick<CurrentUser, "role">, role: RoleCode): boolean {
  return user.role === role;
}

export function canAccessRole(user: CurrentUser | null, allowed: ApplicationRole[]): boolean {
  return user !== null && allowed.some((role) => hasRole(user, role));
}
