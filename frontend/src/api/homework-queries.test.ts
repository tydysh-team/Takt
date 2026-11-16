import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({ apiRequest: vi.fn() }));

import { apiRequest } from "./client";
import { api, queryKeys } from "./queries";

describe("homework list API contract", () => {
  beforeEach(() => { vi.mocked(apiRequest).mockReset(); });

  it("sends teacher search, status, created-at period, and pagination together", async () => {
    await api.teacherHomework("student-1", 20, {
      search: "100%_\\", status: "needs_revision",
      date_from: "2026-03-31T20:00:00Z", date_to: "2026-04-30T20:00:00Z",
    });
    const path = vi.mocked(apiRequest).mock.calls[0]?.[0];
    expect(path).toBeDefined();
    const url = new URL(path ?? "", "http://localhost");
    expect(url.pathname).toBe("/homework");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      limit: "20", offset: "20", student_id: "student-1", search: "100%_\\",
      status: "needs_revision", date_from: "2026-03-31T20:00:00Z", date_to: "2026-04-30T20:00:00Z",
    });
    expect(queryKeys.homework("TEACHER", "student-1", 0)).not.toEqual(
      queryKeys.homework("TEACHER", "student-1", 20, { status: "needs_revision" }),
    );
  });

  it("keeps old student list calls valid and scopes pending totals to a student", async () => {
    await api.studentHomework();
    await api.pendingSubmissions(0, "student-1");
    expect(vi.mocked(apiRequest).mock.calls[0]?.[0]).toBe("/students/me/homework?limit=20&offset=0");
    expect(vi.mocked(apiRequest).mock.calls[1]?.[0]).toBe("/teachers/me/homework/submissions/pending?limit=20&offset=0&student_id=student-1");
  });
});
