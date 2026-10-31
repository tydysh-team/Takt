import { describe, expect, it } from "vitest";

import { lessonActions } from "./lesson-actions";

describe("lesson actions from the server status", () => {
  it("separates reschedule, cancel and attendance for a teacher", () => {
    expect(lessonActions("planned", true)).toEqual({ canReschedule: true, canCancel: true, canUpdateAttendance: false });
    expect(lessonActions("in_progress", true)).toEqual({ canReschedule: false, canCancel: true, canUpdateAttendance: true });
    expect(lessonActions("completed", true)).toEqual({ canReschedule: false, canCancel: false, canUpdateAttendance: true });
    expect(lessonActions("cancelled", true)).toEqual({ canReschedule: false, canCancel: false, canUpdateAttendance: false });
    expect(lessonActions("unknown", true)).toEqual({ canReschedule: false, canCancel: false, canUpdateAttendance: false });
  });

  it("offers no teacher actions to students", () => {
    expect(lessonActions("planned", false)).toEqual({ canReschedule: false, canCancel: false, canUpdateAttendance: false });
    expect(lessonActions("in_progress", false).canCancel).toBe(false);
  });
});
