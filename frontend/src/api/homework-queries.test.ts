import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({ apiRequest: vi.fn() }));

import { apiRequest } from "./client";
import { api, DEFAULT_HOMEWORK_PAGE_SIZE, HOMEWORK_PAGE_SIZES, queryKeys } from "./queries";

describe("homework list API contract", () => {
  beforeEach(() => { vi.mocked(apiRequest).mockReset(); });

  it("sends teacher search, status, created-at period, and pagination together", async () => {
    await api.teacherHomework("student-1", 20, {
      search: "100%_\\", status: "needs_revision",
      date_from: "2026-03-31T20:00:00Z", date_to: "2026-04-30T20:00:00Z",
    }, 20);
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
    expect(vi.mocked(apiRequest).mock.calls[0]?.[0]).toBe("/students/me/homework?limit=5&offset=0");
    expect(vi.mocked(apiRequest).mock.calls[1]?.[0]).toBe("/teachers/me/homework/submissions/pending?limit=5&offset=0&student_id=student-1");
  });

  it("defaults to five records per page and forwards an explicit page size", async () => {
    expect(DEFAULT_HOMEWORK_PAGE_SIZE).toBe(5);
    expect(HOMEWORK_PAGE_SIZES).toEqual([5, 10, 20]);
    await api.teacherHomework(undefined, 10);
    await api.studentHomework(undefined, 20, {}, 10);
    await api.pendingSubmissions(10, undefined, 20);
    const calls = vi.mocked(apiRequest).mock.calls.map((call) => call[0]);
    expect(calls[0]).toBe("/homework?limit=5&offset=10");
    expect(calls[1]).toBe("/students/me/homework?limit=10&offset=20");
    expect(calls[2]).toBe("/teachers/me/homework/submissions/pending?limit=20&offset=10");
  });

  it("includes role, person, filters, offset and page size in the query key", () => {
    const base = queryKeys.homework("TEACHER", "student-1", 0);
    expect(queryKeys.homework("TEACHER", "student-1", 0, { limit: 5 })).toEqual(base);
    expect(queryKeys.homework("TEACHER", "student-1", 5, { limit: 5 })).not.toEqual(base);
    expect(queryKeys.homework("TEACHER", "student-1", 0, { limit: 10 })).not.toEqual(base);
    expect(queryKeys.homework("TEACHER", "student-2", 0)).not.toEqual(base);
    expect(queryKeys.homework("STUDENT", "student-1", 0)).not.toEqual(base);
    expect(queryKeys.homework("TEACHER", "student-1", 0, { search: "задачи" })).not.toEqual(base);
    expect(queryKeys.pendingSubmissions(0)).not.toEqual(queryKeys.pendingSubmissions(0, undefined, 10));
    expect(queryKeys.pendingSubmissions(10, undefined, 5)).not.toEqual(queryKeys.pendingSubmissions(0, undefined, 5));
  });
});
