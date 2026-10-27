import { useRef, useState, type SyntheticEvent } from "react";

import type { LessonCreatePayload, StudentRef } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Feedback";
import { lessonStartUtc } from "../../shared/lesson-time";
import { seriesCountError, seriesSummary } from "./recurrence";
import { formatLessonDate, lessonFormErrors, parseLessonDate } from "./lesson-form-validation";
import { LessonTimePicker } from "./LessonTimePicker";

export function LessonCreateForm({ students, timezone, pending, serverError, onCancel, onCreate }: {
  students: StudentRef[];
  timezone: string;
  pending: boolean;
  serverError?: string | undefined;
  onCancel: () => void;
  onCreate: (payload: LessonCreatePayload) => void;
}) {
  const [studentId, setStudentId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [start, setStart] = useState("");
  const [duration, setDuration] = useState("60");
  const [repeat, setRepeat] = useState(false);
  const [repeatCount, setRepeatCount] = useState("2");

  const [submitted, setSubmitted] = useState(false);
  const [timeError, setTimeError] = useState("");
  const dateTextRef = useRef<HTMLInputElement>(null);
  const datePickerRef = useRef<HTMLInputElement>(null);

  const isoDate = parseLessonDate(date);
  const errors = lessonFormErrors({ studentId, title, date, start, timeError });
  const seriesCount = Number(repeatCount);
  const recurrence = repeat ? { frequency: "weekly" as const, count: seriesCount } : undefined;
  const seriesErrorMessage = repeat ? seriesCountError(seriesCount) : null;
  const invalid = Object.values(errors).some(Boolean) || Boolean(seriesErrorMessage);
  const requiredMissing = !studentId || !title.trim() || !date.trim() || !start.trim();
  const draftSummary = repeat && isoDate && !seriesErrorMessage && start && !errors.start
    ? seriesSummary({
      student_id: studentId,
      title: title.trim(),
      description: description.trim() || null,
      starts_at: lessonStartUtc(isoDate, start, timezone),
      duration_minutes: Number(duration),
      recurrence: recurrence ?? { frequency: "weekly", count: seriesCount },
    }, timezone)
    : "";

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (invalid || !isoDate) return;
    try {
      const startsAt = lessonStartUtc(isoDate, start, timezone);
      onCreate({
        student_id: studentId,
        title: title.trim(),
        description: description.trim() || null,
        starts_at: startsAt,
        duration_minutes: Number(duration),
        ...(recurrence ? { recurrence } : {}),
      });
    } catch {
      setTimeError("Это время не существует или неоднозначно из-за перехода часов. Выберите другое время.");
    }
  }

  return <form className="lesson-create-form" onSubmit={submit} noValidate>
    <header className="lesson-create-form__header">
      <h2 id="dialog-title">Создать занятие</h2>
      <p>{submitted && invalid ? requiredMissing ? "Заполните обязательные поля." : "Проверьте дату и время." : "Запланируйте новую учебную встречу."}</p>
    </header>
    {serverError ? <Alert tone="error">{serverError}</Alert> : null}
    <div className="form-field">
      <label htmlFor="lesson-student">Ученик</label>
      <select id="lesson-student" name="student_id" className="input" value={studentId} aria-invalid={submitted && Boolean(errors.student_id)} aria-describedby={submitted && errors.student_id ? "lesson-student-error" : undefined} onChange={(event) => { setStudentId(event.target.value); }}>
        <option value="" disabled>Выберите ученика</option>
        {students.map((student) => <option key={student.id} value={student.id}>{student.first_name} {student.last_name}</option>)}
      </select>
      {submitted && errors.student_id ? <span className="form-field__error" id="lesson-student-error" role="alert">{errors.student_id}</span> : null}
    </div>
    <div className="form-field">
      <label htmlFor="lesson-title">Название</label>
      <input id="lesson-title" name="title" className="input" value={title} maxLength={120} placeholder="Введите название урока" aria-invalid={submitted && Boolean(errors.title)} aria-describedby={submitted && errors.title ? "lesson-title-error" : undefined} onChange={(event) => { setTitle(event.target.value); }} />
      {submitted && errors.title ? <span className="form-field__error" id="lesson-title-error" role="alert">{errors.title}</span> : null}
    </div>
    <div className="form-field">
      <div className="lesson-create-form__label-row"><label htmlFor="lesson-description">Описание</label><span>Необязательно</span></div>
      <textarea id="lesson-description" name="description" className="input textarea" value={description} maxLength={2000} rows={3} placeholder="Что планируете разобрать на занятии..." onChange={(event) => { setDescription(event.target.value); }} />
    </div>
    <div className="lesson-create-form__datetime">
      <div className="form-field">
        <label htmlFor="lesson-date">Дата</label>
        <div className="input lesson-create-form__date-control" aria-invalid={submitted && Boolean(errors.date)}>
          <input ref={dateTextRef} id="lesson-date" name="date" type="text" autoComplete="off" maxLength={10} placeholder="дд.мм.гггг" value={date} aria-invalid={submitted && Boolean(errors.date)} aria-describedby={submitted && errors.date ? "lesson-date-error" : undefined} onChange={(event) => { setDate(event.target.value); setTimeError(""); }} />
          <button type="button" className="lesson-create-form__date-picker" aria-label="Выбрать дату в календаре" onClick={() => {
            const input = datePickerRef.current;
            if (!input) return;
            try { input.showPicker(); } catch { dateTextRef.current?.focus(); }
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 10h18" /></svg>
          </button>
          <input ref={datePickerRef} className="lesson-create-form__native-date" type="date" tabIndex={-1} aria-hidden="true" value={isoDate ?? ""} onChange={(event) => { setDate(formatLessonDate(event.target.value)); setTimeError(""); }} />
        </div>
        {submitted && errors.date ? <span className="form-field__error" id="lesson-date-error" role="alert">{errors.date}</span> : null}
      </div>
      <div className="form-field">
        <label htmlFor="lesson-start">Время</label>
        <LessonTimePicker value={start} onChange={(value) => { setStart(value); setTimeError(""); }} invalid={submitted && Boolean(errors.start)} errorId={submitted && errors.start ? "lesson-start-error" : undefined} />
        {submitted && errors.start ? <span className="form-field__error" id="lesson-start-error" role="alert">{errors.start}</span> : null}
      </div>
    </div>
    <p className="lesson-create-form__hint" title={timezone}>Дата и время интерпретируются в часовом поясе пользователя.</p>
    {submitted && invalid ? <p className="lesson-create-form__summary" role="alert">{requiredMissing ? "Заполните обязательные поля перед созданием занятия." : "Проверьте выделенные поля перед созданием занятия."}</p> : null}
    <div className="lesson-create-form__footer">
      <div className="form-field lesson-create-form__duration">
        <label htmlFor="lesson-duration">Длительность</label>
        <select id="lesson-duration" name="duration_minutes" className="input" value={duration} onChange={(event) => { setDuration(event.target.value); }}>
          {[30, 45, 60, 90, 120].map((minutes) => <option key={minutes} value={minutes}>{minutes} минут</option>)}
        </select>
      </div>
      <div className="lesson-create-form__repeat">
        <label><input type="checkbox" checked={repeat} onChange={(event) => { setRepeat(event.target.checked); }} /> Повторять каждую неделю</label>
        {repeat ? <label>Количество занятий <select className="input" aria-invalid={Boolean(seriesErrorMessage)} value={repeatCount} onChange={(event) => { setRepeatCount(event.target.value); }}>{Array.from({ length: 51 }, (_, index) => <option key={index + 2} value={index + 2}>{index + 2}</option>)}</select></label> : null}
        {repeat ? <p className={`lesson-create-form__series-summary${seriesErrorMessage ? " lesson-create-form__series-summary--error" : ""}`} role={seriesErrorMessage ? "alert" : undefined}>{seriesErrorMessage ?? draftSummary}</p> : null}
      </div>
      <div className="dialog__actions">
        <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>Отмена</Button>
        <Button type="submit" loading={pending} disabled={submitted && invalid}>Создать занятие</Button>
      </div>
    </div>
  </form>;
}



