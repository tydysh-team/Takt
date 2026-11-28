import { useRef } from "react";

import { formatLessonDate, parseLessonDate } from "./lesson-form-validation";
import { useLessonInputFormat } from "./lesson-input-format";

export function LessonDateInput({ id, name, value, onChange, invalid = false, errorId }: {
  id: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  errorId?: string | undefined;
}) {
  const input = useLessonInputFormat("date", value, onChange);
  const calendarRef = useRef<HTMLInputElement>(null);
  return <div className="input lesson-create-form__date-control" aria-invalid={invalid}>
    <input id={id} type="text" name={name} autoComplete="off" inputMode="numeric" maxLength={10} placeholder="дд.мм.гггг" value={value} aria-invalid={invalid} aria-describedby={errorId} {...input} />
    <button type="button" className="lesson-create-form__date-picker" aria-label="Выбрать дату в календаре" onClick={() => {
      try { calendarRef.current?.showPicker(); } catch { input.ref.current?.focus(); }
    }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 10h18" /></svg>
    </button>
    <input ref={calendarRef} className="lesson-create-form__native-date" type="date" tabIndex={-1} aria-hidden="true" value={parseLessonDate(value) ?? ""} onChange={(event) => { onChange(formatLessonDate(event.target.value)); }} />
  </div>;
}
