import { useState, type SyntheticEvent } from "react";

import type { LessonFormPayload, StudentRef } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Feedback";
import { lessonStartUtc } from "../../shared/lesson-time";
import { seriesCountError, seriesSummary } from "./recurrence";
import { lessonFormErrors, parseLessonDate } from "./lesson-form-validation";
import { LessonDateInput } from "./LessonDateInput";
import { LessonTimePicker } from "./LessonTimePicker";

export type StudentPickerState = "loading" | "error" | "empty" | "ready";

export function LessonCreateForm({ students, studentsState = "ready", onRetryStudents, timezone, pending, serverError, serverTimeError, onTimeChange, onCancel, onCreate }: {
  students: StudentRef[];
  studentsState?: StudentPickerState;
  onRetryStudents?: (() => void) | undefined;
  timezone: string;
  pending: boolean;
  serverError?: string | undefined;
  serverTimeError?: string | undefined;
  onTimeChange?: (() => void) | undefined;
  onCancel: () => void;
  onCreate: (payload: LessonFormPayload) => void;
}) {
  const [studentId, setStudentId] = useState("");
  const [group, setGroup] = useState(false);
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [start, setStart] = useState("");
  const [duration, setDuration] = useState("60");
  const [repeat, setRepeat] = useState(false);
  const [repeatCount, setRepeatCount] = useState("2");

  const [submitted, setSubmitted] = useState(false);
  const [timeError, setTimeError] = useState("");

  const isoDate = parseLessonDate(date);
  const errors = lessonFormErrors({ studentId: group ? (studentIds.length >= 2 ? "group" : "") : studentId, title, date, start, timeError });
  if (group && studentIds.length < 2) errors.student_id = "Выберите минимум двух разных учеников.";
  const seriesCount = Number(repeatCount);
  const recurrence = repeat ? { frequency: "weekly" as const, count: seriesCount } : undefined;
  const seriesErrorMessage = repeat ? seriesCountError(seriesCount) : null;
  const invalid = Object.values(errors).some(Boolean) || Boolean(seriesErrorMessage);
  const studentsUnavailable = studentsState !== "ready";
  const studentPlaceholder = studentsState === "loading"
    ? "Загружаем учеников…"
    : studentsState === "error"
      ? "Список учеников недоступен"
      : studentsState === "empty"
        ? "Нет доступных учеников"
        : "Выберите ученика";
  const requiredMissing = (group ? studentIds.length < 2 : !studentId) || !title.trim() || !date.trim() || !start.trim();
  const draftSummary = repeat && isoDate && !seriesErrorMessage && start && !errors.start
    ? seriesSummary({
      ...(group ? { student_ids: studentIds } : { student_id: studentId }),
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
        ...(group ? { student_ids: studentIds } : { student_id: studentId }),
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
    {studentsState === "error" ? (
      <Alert tone="error">
        Не удалось загрузить список учеников. {onRetryStudents ? <button type="button" className="alert__action" onClick={onRetryStudents}>Повторить</button> : null}
      </Alert>
    ) : studentsState === "empty" ? (
      <Alert tone="info">Нет доступных учеников. Подключите ученика в разделе «Ученики».</Alert>
    ) : null}
    <div className="lesson-type-picker" role="group" aria-label="Тип занятия">
      <button type="button" className="button button--secondary" aria-pressed={!group} onClick={() => { setGroup(false); }}>Индивидуальное</button>
      <button type="button" className="button button--secondary" aria-pressed={group} onClick={() => { setGroup(true); }}>Групповое</button>
    </div>
    {group ? <div className="form-field">
      <button type="button" className="input" disabled={studentsUnavailable} aria-expanded={pickerOpen} aria-controls="lesson-participant-picker" onClick={() => { setPickerOpen(!pickerOpen); }}>Участники: выбрано {studentIds.length}</button>
      {pickerOpen ? <div id="lesson-participant-picker" className="lesson-participant-picker">
        <input className="input" aria-label="Поиск учеников" placeholder="Поиск по имени и фамилии" value={search} onChange={(event) => { setSearch(event.target.value); }} />
        <div className="lesson-participant-picker__list">
          {students.filter((student) => `${student.first_name} ${student.last_name}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).map((student) => <label key={student.id}>
            <input type="checkbox" checked={studentIds.includes(student.id)} onChange={(event) => { setStudentIds((ids) => event.target.checked ? [...ids, student.id] : ids.filter((id) => id !== student.id)); }} />
            {student.first_name} {student.last_name}
          </label>)}
        </div>
        <button type="button" className="button button--secondary" onClick={() => { setPickerOpen(false); }}>Закрыть список</button>
      </div> : null}
      <div className="lesson-participant-chips">{students.filter((student) => studentIds.includes(student.id)).map((student) => <button type="button" className="button button--secondary" key={student.id} aria-label={`Исключить ${student.first_name} ${student.last_name}`} onClick={() => { setStudentIds((ids) => ids.filter((id) => id !== student.id)); }}>{student.first_name} {student.last_name} ×</button>)}</div>
      {submitted && errors.student_id ? <span className="form-field__error" role="alert">{errors.student_id}</span> : null}
    </div> : <div className="form-field">
      <label htmlFor="lesson-student">Ученик</label>
      <select id="lesson-student" name="student_id" className="input" value={studentId} disabled={studentsUnavailable} aria-invalid={submitted && Boolean(errors.student_id)} aria-describedby={submitted && errors.student_id ? "lesson-student-error" : undefined} onChange={(event) => { setStudentId(event.target.value); }}>
        <option value="" disabled>{studentPlaceholder}</option>
        {students.map((student) => <option key={student.id} value={student.id}>{student.first_name} {student.last_name}</option>)}
      </select>
      {submitted && errors.student_id ? <span className="form-field__error" id="lesson-student-error" role="alert">{errors.student_id}</span> : null}
    </div>}
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
        <LessonDateInput id="lesson-date" name="date" value={date} invalid={Boolean(serverTimeError) || (submitted && Boolean(errors.date))} errorId={serverTimeError ? "lesson-server-time-error" : submitted && errors.date ? "lesson-date-error" : undefined} onChange={(value) => { setDate(value); setTimeError(""); onTimeChange?.(); }} />
        {submitted && errors.date ? <span className="form-field__error" id="lesson-date-error" role="alert">{errors.date}</span> : null}
      </div>
      <div className="form-field">
        <label htmlFor="lesson-start">Время</label>
        <LessonTimePicker value={start} onChange={(value) => { setStart(value); setTimeError(""); onTimeChange?.(); }} invalid={Boolean(serverTimeError) || (submitted && Boolean(errors.start))} errorId={serverTimeError ? "lesson-server-time-error" : submitted && errors.start ? "lesson-start-error" : undefined} />
        {submitted && errors.start ? <span className="form-field__error" id="lesson-start-error" role="alert">{errors.start}</span> : null}
      </div>
    </div>
    {serverTimeError ? <p className="form-field__error" id="lesson-server-time-error" role="alert">{serverTimeError}</p> : null}
    <p className="lesson-create-form__hint" title={timezone}>Дата и время интерпретируются в часовом поясе пользователя.</p>
    {submitted && invalid ? <p className="lesson-create-form__summary" role="alert">{requiredMissing ? "Заполните обязательные поля перед созданием занятия." : "Проверьте выделенные поля перед созданием занятия."}</p> : null}
    <div className="lesson-create-form__footer">
      <div className="lesson-create-form__options">
        <div className="form-field lesson-create-form__duration">
          <label htmlFor="lesson-duration">Длительность</label>
          <select id="lesson-duration" name="duration_minutes" className="input" value={duration} onChange={(event) => { setDuration(event.target.value); }}>
            {[30, 45, 60, 90, 120].map((minutes) => <option key={minutes} value={minutes}>{minutes} минут</option>)}
          </select>
        </div>
        <div className="lesson-create-form__repeat">
          <span className="lesson-create-form__repeat-label">Регулярность</span>
          <label className="lesson-create-form__repeat-toggle"><input type="checkbox" checked={repeat} onChange={(event) => { setRepeat(event.target.checked); }} /> Повторять каждую неделю</label>
          {repeat ? <label className="lesson-create-form__repeat-count">Количество занятий <select className="input" aria-invalid={Boolean(seriesErrorMessage)} value={repeatCount} onChange={(event) => { setRepeatCount(event.target.value); }}>{Array.from({ length: 51 }, (_, index) => <option key={index + 2} value={index + 2}>{index + 2}</option>)}</select></label> : null}
        </div>
      </div>
      {repeat ? <p className={`lesson-create-form__series-summary${seriesErrorMessage ? " lesson-create-form__series-summary--error" : ""}`} role={seriesErrorMessage ? "alert" : undefined}>{seriesErrorMessage ?? draftSummary}</p> : null}
      <div className="dialog__actions">
        <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>Отмена</Button>
        <Button type="submit" loading={pending} disabled={(submitted && invalid) || studentsUnavailable}>Создать занятие</Button>
      </div>
    </div>
  </form>;
}



