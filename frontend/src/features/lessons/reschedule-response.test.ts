import { describe, expect, it, vi } from "vitest";

vi.mock("../../shared/config/environment", () => ({
  environment: { apiBaseUrl: "http://api.example" },
}));

import { ApiError } from "../../api/client";
import { rescheduleConflicts } from "./reschedule-response";

describe("reschedule conflict response", () => {
  it("accepts only the exact 409 lesson_time_conflict code", () => {
    const conflict = { id: "lesson", title: "Математика", starts_at: "2030-01-01T10:00:00Z" };
    expect(rescheduleConflicts(new ApiError("lesson_time_conflict", "Conflict", 409, [], { conflicts: [conflict] }))).toEqual([conflict]);
    expect(rescheduleConflicts(new ApiError("lesson_not_reschedulable", "Started", 409))).toBeNull();
    expect(rescheduleConflicts(new ApiError("lesson_time_conflict", "Conflict", 400))).toBeNull();
    expect(rescheduleConflicts(new Error("Network failed"))).toBeNull();
  });
});
