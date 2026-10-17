import { describe, expect, it } from "vitest";

import { registrationSchema } from "../features/auth/registration-schema";
import { profileSchema } from "../features/profile/profile-schema";
import { DEFAULT_TIMEZONE, timezoneOptions, timezoneOrDefault } from "../shared/timezones";

describe("optional middle name forms", () => {
  it("accepts blank registration middle name", () => {
    expect(registrationSchema.safeParse({
      first_name: "Ada", last_name: "Lovelace", middle_name: "",
      email: "ada@example.com", password: "StrongPass!123", role: "TEACHER",
    }).success).toBe(true);
  });

  it.each([
    ["1234567", false],
    ["abcdefgh", true],
    ["12345678", true],
    ["onlyletters", true],
    ["NoSpecial123", true],
    ["a".repeat(128), true],
    ["a".repeat(129), false],
  ])("validates password %s by length only", (password, valid) => {
    const result = registrationSchema.safeParse({
      first_name: "Ada", last_name: "Lovelace", middle_name: "",
      email: "ada@example.com", password, role: "TEACHER",
    });
    expect(result.success).toBe(valid);
  });

  it("does not include timezone in parsed registration data", () => {
    const result = registrationSchema.parse({
      first_name: "Ada", last_name: "Lovelace", middle_name: "",
      email: "ada@example.com", password: "12345678", role: "STUDENT",
      timezone: "Europe/Samara",
    });
    expect(result).not.toHaveProperty("timezone");
  });

  it("offers Moscow as the default timezone", () => {
    expect(DEFAULT_TIMEZONE).toBe("Europe/Moscow");
    expect(timezoneOptions().find((option) => option.value === DEFAULT_TIMEZONE)?.label)
      .toBe("UTC+03:00 — Москва");
  });

  it("falls back when browser timezone is missing or invalid", () => {
    expect(timezoneOrDefault(undefined)).toBe(DEFAULT_TIMEZONE);
    expect(timezoneOrDefault("Invalid/Timezone")).toBe(DEFAULT_TIMEZONE);
    expect(timezoneOrDefault("Europe/Samara")).toBe("Europe/Samara");
  });

  it("accepts blank profile middle name", () => {
    expect(profileSchema.safeParse({
      first_name: "Ada", last_name: "Lovelace", middle_name: "",
      bio: "", timezone: "UTC",
    }).success).toBe(true);
  });

  it("allows changing profile timezone", () => {
    expect(profileSchema.safeParse({
      first_name: "Ada", last_name: "Lovelace", middle_name: "",
      bio: "", timezone: "Europe/Samara",
    }).success).toBe(true);
  });
});
