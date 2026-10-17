import { describe, expect, it } from "vitest";

import type { CurrentUser, RoleCode } from "../../api/types";
import { canAccessRole, hasRole } from "./roles";

const user = (role: RoleCode): CurrentUser => ({
  id: "user-id", email: "user@example.com", role,
  first_name: "Ada", last_name: "Lovelace", middle_name: null,
});

describe("single role and route access", () => {
  it("permits each workspace only for its role", () => {
    expect(hasRole(user("TEACHER"), "TEACHER")).toBe(true);
    expect(hasRole(user("TEACHER"), "STUDENT")).toBe(false);
    expect(canAccessRole(user("STUDENT"), ["STUDENT"])).toBe(true);
    expect(canAccessRole(user("STUDENT"), ["TEACHER"])).toBe(false);
    expect(canAccessRole(user("TEACHER"), ["TEACHER"])).toBe(true);
    expect(canAccessRole(user("TEACHER"), ["STUDENT"])).toBe(false);
  });

  it("does not grant application routes to an admin-only or missing session", () => {
    expect(canAccessRole(user("ADMIN"), ["TEACHER", "STUDENT"])).toBe(false);
    expect(canAccessRole(null, ["TEACHER"])).toBe(false);
  });
});
