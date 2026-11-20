import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../shared/config/environment", () => ({
  environment: { apiBaseUrl: "http://api.example" },
}));

import { Temporal } from "@js-temporal/polyfill";

import { queryKeys } from "../../api/queries";
import type { ProgressResponse } from "../../api/types";
import { ProgressQueryState } from "./ProgressQueryState";
import { ProgressReport } from "./ProgressReport";
import {
  attendanceLabel,
  formatGrade,
  formatPercent,
  inputsPeriod,
  isValidPeriod,
  monthPeriod,
  periodInputs,
  periodQuery,
  statusLabel,
} from "./progress-format";

const noop = () => undefined;

const emptyProgress: ProgressResponse = {
  student_id: "student-1",
  date_from: "2030-01-01T00:00:00Z",
  date_to: "2030-02-01T00:00:00Z",
  attendance: {
    total_lessons: 0,
    completed_lessons: 0,
    attended_lessons: 0,
    missed_lessons: 0,
    unmarked_lessons: 0,
    cancelled_lessons: 0,
    attendance_rate: null,
  },
  homework: {
    assigned: 0,
    submitted: 0,
    reviewed: 0,
    late: 0,
    revision_required: 0,
    completion_rate: null,
  },
  reviews: { graded_homework: 0, average_grade: null },
};

describe("progress formatting", () => {
  it("renders N/A for missing rates but keeps real zeroes", () => {
    expect(formatPercent(null)).toBe("N/A");
    expect(formatPercent(0)).toBe("0 %");
    expect(formatPercent(33.33)).toBe("33,33 %");
    expect(formatGrade(null)).toBe("N/A");
    expect(formatGrade(0)).toBe("0");
  });

  it("labels lesson statuses and attendance", () => {
    expect(statusLabel("completed")).toBe("Завершено");
    expect(statusLabel("cancelled")).toBe("Отменено");
    expect(attendanceLabel("not_set")).toBe("Не отмечено");
    expect(attendanceLabel("present")).toBe("Присутствовал");
  });

  it("keeps role and period in query keys and sends no extra student_id", () => {
    const from = "2030-01-01T00:00:00Z";
    const to = "2030-02-01T00:00:00Z";
    const other = "2030-03-01T00:00:00Z";

    expect(queryKeys.progress("STUDENT", undefined, from, to)).toEqual([
      "progress",
      "STUDENT",
      "me",
      from,
      to,
    ]);
    expect(queryKeys.progress("TEACHER", "student-1", from, to)).toEqual([
      "progress",
      "TEACHER",
      "student-1",
      from,
      to,
    ]);
    expect(queryKeys.progress("TEACHER", "student-1", from, to)).not.toEqual(
      queryKeys.progress("TEACHER", "student-1", from, other),
    );
    expect(periodQuery({ date_from: from, date_to: to })).toBe(
      `date_from=${encodeURIComponent(from)}&date_to=${encodeURIComponent(to)}`,
    );
    expect(periodQuery({ date_from: from, date_to: to })).not.toContain("student_id");
  });

  it("builds a half-open period and converts inclusive date inputs", () => {
    const month = monthPeriod("UTC", Temporal.Instant.from("2030-01-15T12:00:00Z"));
    expect(isValidPeriod(month)).toBe(true);
    expect(periodInputs(month, "UTC")).toEqual({ from: "2030-01-01", to: "2030-01-31" });

    const converted = inputsPeriod("2030-01-01", "2030-01-31", "UTC");
    expect(converted).not.toBeNull();
    expect(converted?.date_from).toBe("2030-01-01T00:00:00Z");
    expect(converted?.date_to).toBe("2030-02-01T00:00:00Z");
    expect(inputsPeriod("2030-02-01", "2030-01-01", "UTC")).toBeNull();
  });
});

describe("progress UI states", () => {
  it("shows N/A blocks without inventing comparison or a hidden score", () => {
    const html = renderToStaticMarkup(<ProgressReport data={emptyProgress} />);
    expect(html).toContain("N/A");
    expect(html).toContain("Всего занятий");
    expect(html).toContain("Оценённых работ");
    expect(html).toContain("Возвращалось на доработку");
    expect(html).toContain("Сдано с опозданием");
    expect(html).toContain("Принято");
    expect(html).not.toContain("прошлому периоду");
    expect(html).not.toContain("рейтинг");
    expect(html).not.toContain("динамика");
  });

  it("distinguishes loading, error and success", () => {
    const loading = renderToStaticMarkup(
      <ProgressQueryState isLoading isError={false} error={null} onRetry={noop}>
        Готово
      </ProgressQueryState>,
    );
    expect(loading).toContain("Считаем статистику");
    expect(loading).toContain('role="status"');

    const error = renderToStaticMarkup(
      <ProgressQueryState isLoading={false} isError error={new Error("boom")} onRetry={noop}>
        Готово
      </ProgressQueryState>,
    );
    expect(error).toContain("Что-то пошло не так");
    expect(error).toContain('role="alert"');
    expect(error).not.toContain("Готово");

    const success = renderToStaticMarkup(
      <ProgressQueryState isLoading={false} isError={false} error={null} onRetry={noop}>
        Готово
      </ProgressQueryState>,
    );
    expect(success).toContain("Готово");
  });
});
