// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LessonDateInput } from "./LessonDateInput";
import { LessonTimePicker } from "./LessonTimePicker";
import { formatLessonInputEdit } from "./lesson-input-format";
import { lessonFormErrors, parseLessonDate } from "./lesson-form-validation";

afterEach(cleanup);

describe("lesson input formatting", () => {
  it("inserts date separators and maps the caret after pasted digits", () => {
    expect(formatLessonInputEdit({ kind: "date", previous: "", value: "02122026", inputType: "insertFromPaste" }))
      .toEqual({ value: "02.12.2026", start: 10, end: 10 });
  });

  it.each(["1530", "15.30", "15:30"])("accepts time entered as %s", (value) => {
    expect(formatLessonInputEdit({ kind: "time", previous: "", value }).value).toBe("15:30");
  });

  it.each(["0", "02", "02.", "02.1", "02.12.", "02.12.2"])("preserves intermediate date %s", (value) => {
    expect(formatLessonInputEdit({ kind: "date", previous: "", value }).value).toBe(value);
  });

  it.each(["1", "15", "15:", "15:3", "1:3"])("preserves intermediate time %s", (value) => {
    expect(formatLessonInputEdit({ kind: "time", previous: "", value }).value).toBe(value);
  });

  it("allows deleting separators, digits and the entire selection", () => {
    expect(formatLessonInputEdit({ kind: "date", previous: "02.12.2026", value: "0212.2026", start: 2, inputType: "deleteContentForward" }))
      .toEqual({ value: "0212.2026", start: 2, end: 2 });
    expect(formatLessonInputEdit({ kind: "time", previous: "15:30", value: "1530", start: 2, inputType: "deleteContentBackward" }).value).toBe("1530");
    expect(formatLessonInputEdit({ kind: "date", previous: "02.12.2026", value: "02.12.202", inputType: "deleteContentBackward" }).value).toBe("02.12.202");
    expect(formatLessonInputEdit({ kind: "time", previous: "15:30", value: "", inputType: "deleteByCut" }).value).toBe("");
  });

  it("preserves selection positions when replacing a value in the middle", () => {
    expect(formatLessonInputEdit({ kind: "date", previous: "02.12.2026", value: "02.05.2026", start: 4, end: 5, inputType: "insertText" }))
      .toEqual({ value: "02.05.2026", start: 4, end: 5 });
    expect(formatLessonInputEdit({ kind: "time", previous: "15:30", value: "0930", inputType: "insertFromPaste" }).value).toBe("09:30");
  });

  it("keeps invalid values available for the existing validation", () => {
    const date = formatLessonInputEdit({ kind: "date", previous: "", value: "32132026" }).value;
    const time = formatLessonInputEdit({ kind: "time", previous: "", value: "25.70" }).value;
    expect(date).toBe("32.13.2026");
    expect(time).toBe("25:70");
    expect(parseLessonDate(date)).toBeNull();
    const errors = lessonFormErrors({ studentId: "a", title: "Lesson", date, start: time });
    expect(errors.date).toBe("Укажите корректную дату.");
    expect(errors.start).toBe("Укажите корректное время.");
    expect(formatLessonInputEdit({ kind: "time", previous: "", value: "ab15" }).value).toBe("ab15");
  });
});

function Fields() {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  return <>
    <label htmlFor="date">Дата</label><LessonDateInput id="date" value={date} onChange={setDate} />
    <label htmlFor="lesson-start">Время</label><LessonTimePicker value={time} onChange={setTime} invalid={false} />
    <button type="button">Другое поле</button>
  </>;
}

describe("controlled lesson inputs", () => {
  it("formats browser paste input and keeps the caret while editing and deleting", () => {
    render(<Fields />);
    const date = screen.getByLabelText<HTMLInputElement>("Дата");
    date.focus();
    // InputEvent is the browser's default editing action following paste.
    fireEvent.paste(date, { clipboardData: { getData: () => "02122026" } });
    fireEvent.input(date, { target: { value: "02122026", selectionStart: 8, selectionEnd: 8 }, inputType: "insertFromPaste" });
    expect(date.value).toBe("02.12.2026");
    expect(date.selectionStart).toBe(10);
    fireEvent.input(date, { target: { value: "02.05.2026", selectionStart: 5, selectionEnd: 5 }, inputType: "insertText" });
    expect(date.selectionStart).toBe(5);
    fireEvent.input(date, { target: { value: "0205.2026", selectionStart: 2, selectionEnd: 2 }, inputType: "deleteContentForward" });
    expect(date.value).toBe("0205.2026");
    expect(date.selectionStart).toBe(2);
    fireEvent.input(date, { target: { value: "", selectionStart: 0, selectionEnd: 0 }, inputType: "deleteByCut" });
    expect(date.value).toBe("");
  });

  it("normalizes a dot, retains the caret and lets a deleted colon stay deleted until blur", () => {
    render(<Fields />);
    const time = screen.getByLabelText<HTMLInputElement>("Время");
    time.focus();
    fireEvent.input(time, { target: { value: "15.30", selectionStart: 5, selectionEnd: 5 }, inputType: "insertFromPaste" });
    expect(time.value).toBe("15:30");
    fireEvent.input(time, { target: { value: "16:30", selectionStart: 2, selectionEnd: 2 }, inputType: "insertText" });
    expect(time.value).toBe("16:30");
    expect(time.selectionStart).toBe(2);
    fireEvent.input(time, { target: { value: "1630", selectionStart: 2, selectionEnd: 2 }, inputType: "deleteContentBackward" });
    expect(time.value).toBe("1630");
    expect(time.selectionStart).toBe(2);
    fireEvent.blur(time);
    expect(time.value).toBe("16:30");
  });

  it("retains the calendar and the existing hour/minute picker", () => {
    const { container } = render(<Fields />);
    const calendar = container.querySelector<HTMLInputElement>('input[type="date"]')!;
    calendar.showPicker = vi.fn();
    fireEvent.click(screen.getByRole("button", { name: "Выбрать дату в календаре" }));
    expect(calendar.showPicker).toHaveBeenCalledOnce();
    fireEvent.change(calendar, { target: { value: "2026-12-02" } });
    expect(screen.getByLabelText<HTMLInputElement>("Дата").value).toBe("02.12.2026");
    fireEvent.click(screen.getByRole("button", { name: "Выбрать время" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Часы" })).getByRole("button", { name: "18" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Минуты" })).getByRole("button", { name: "25" }));
    expect(screen.getByLabelText<HTMLInputElement>("Время").value).toBe("18:25");
  });

  it("does not restore a stale caret on unrelated rerenders after normalization", () => {
    const view = render(<Fields />);
    const time = screen.getByLabelText<HTMLInputElement>("Время");
    time.focus();
    fireEvent.input(time, { target: { value: "15:30" }, inputType: "insertFromPaste" });
    fireEvent.input(time, { target: { value: "15.30", selectionStart: 4, selectionEnd: 4 }, inputType: "insertText" });
    time.setSelectionRange(1, 1);
    view.rerender(<Fields />);
    expect(time.selectionStart).toBe(1);
    expect(time.value).toBe("15:30");
  });
});
