import { Temporal } from "@js-temporal/polyfill";

export function parseLessonDate(value: string): string | null {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (year < 1) return null;

  try {
    return Temporal.PlainDate.from({ year, month, day }, { overflow: "reject" }).toString();
  } catch {
    return null;
  }
}

export function formatLessonDate(value: string): string {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}.${month}.${year}` : "";
}

export function lessonFormErrors(values: {
  studentId: string;
  title: string;
  date: string;
  start: string;
  timeError?: string;
}) {
  const { studentId, title, date, start, timeError = "" } = values;
  const validTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(start);
  return {
    student_id: studentId ? "" : "Выберите ученика.",
    title: title.trim() ? "" : "Укажите название занятия.",
    date: !date.trim() ? "Укажите дату." : !parseLessonDate(date) ? "Укажите корректную дату." : "",
    start: !start.trim() ? "Укажите время." : !validTime ? "Укажите корректное время." : timeError,
  };
}

export const minuteSuggestions = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, "0"));
