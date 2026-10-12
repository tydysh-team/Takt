import { describe, expect, it } from "vitest";

import { registrationSchema } from "../features/auth/registration-schema";
import { profileSchema } from "../features/profile/profile-schema";
import { DEFAULT_TIMEZONE, TIMEZONE_OPTIONS } from "../shared/timezones";

describe("optional middle name forms", () => {
  it("accepts blank registration middle name", () => {
    expect(registrationSchema.safeParse({
      first_name: "Ada", last_name: "Lovelace", middle_name: "",
      email: "ada@example.com", password: "StrongPass!123", role: "TEACHER",
      timezone: DEFAULT_TIMEZONE,
    }).success).toBe(true);
  });

  it("offers Moscow as the default timezone", () => {
    expect(DEFAULT_TIMEZONE).toBe("Europe/Moscow");
    expect(TIMEZONE_OPTIONS.find((option) => option.value === DEFAULT_TIMEZONE)?.label)
      .toBe("UTC+03:00 — Москва");
  });

  it("accepts blank profile middle name", () => {
    expect(profileSchema.safeParse({
      first_name: "Ada", last_name: "Lovelace", middle_name: "",
      bio: "", timezone: "UTC",
    }).success).toBe(true);
  });
});
