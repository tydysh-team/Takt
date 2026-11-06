import { describe, expect, it, vi } from "vitest";

vi.mock("../../shared/config/environment", () => ({
  environment: { apiBaseUrl: "http://api.example" },
}));

import { ApiError } from "../../api/client";
import { rescheduleConflicts } from "./reschedule-response";
import { studentScheduleConflictMessage } from "./student-conflict";

describe("studentScheduleConflictMessage", () => {
  it("shows safe intervals for single creation, series, and reschedule errors", () => {
    const error = new ApiError("student_schedule_conflict", "Conflict", 409, [], {
      conflicts: [
        { starts_at: "2030-01-07T15:00:00Z", ends_at: "2030-01-07T16:00:00Z" },
        { series_number: 3, starts_at: "2030-01-21T15:30:00Z", ends_at: "2030-01-21T16:30:00Z" },
      ],
    });
    const message = studentScheduleConflictMessage(error, "UTC");
    expect(message).toContain("Ученик уже занят у другого преподавателя");
    expect(message).toContain("Выберите другое время");
    expect(message).toContain("Занятие №3");
    expect(message).toContain("15:00");
    expect(rescheduleConflicts(error)).toBeNull();
  });

  it("does not turn soft conflicts into hard warnings or use private fields", () => {
    const soft = new ApiError("lesson_time_conflict", "Conflict", 409);
    expect(studentScheduleConflictMessage(soft, "UTC")).toBeNull();
    const hard = new ApiError("student_schedule_conflict", "Conflict", 409, [], {
      conflicts: [{ starts_at: "2030-01-07T15:00:00Z", ends_at: "2030-01-07T16:00:00Z", title: "Private" }],
    });
    expect(studentScheduleConflictMessage(hard, "UTC")).not.toContain("Private");
  });
});
