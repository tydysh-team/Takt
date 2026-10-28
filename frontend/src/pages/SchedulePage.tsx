import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Temporal } from "@js-temporal/polyfill";

import { ApiError, readableError } from "../api/client";
import { api, queryKeys } from "../api/queries";
import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/ui/Card";
import { Dialog } from "../components/ui/Dialog";
import { Drawer } from "../components/ui/Drawer";
import { Alert, ErrorState, LoadingState } from "../components/ui/Feedback";
import { useAuth } from "../features/auth/auth-context";
import { LessonCreateForm } from "../features/lessons/LessonCreateForm";
import { findLessonConflicts, formatConflictRange } from "../features/lessons/conflict-check";
import { effectiveLessonStatus, lessonAttendanceLabel } from "../features/lessons/lesson-status";
import { classifyStack, groupLessonStacks, stackDurationMinutes } from "../features/lessons/schedule-groups";
import type {
  LessonCreatePayload,
  LessonConflict,
  LessonFormPayload,
  LessonReadDTO,
  LessonSeriesPayload,
} from "../api/types";
import { dayStartUtc, formatLessonDateTime, formatLessonTime, lessonStartUtc, localDate, weekDays } from "../shared/lesson-time";
import { DEFAULT_TIMEZONE } from "../shared/timezones";

const monthNames = ["янв.", "февр.", "марта", "апр.", "мая", "июня", "июля", "авг.", "сент.", "окт.", "нояб.", "дек."];
const dayNames = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
const dayShortNames = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function createWeekDays(now: string, offset: number, timezone: string) {
  return weekDays(now, offset, timezone).map((date, index) => ({
    short: dayShortNames[index], date: `${String(date.day)} ${monthNames[date.month - 1] ?? ""}`,
    iso: date.toString(), plainDate: date,
  }));
}

function timeToMinutes(time: string) {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function safeDuration(value: unknown): number { return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 60; }

const CALENDAR_MINUTE_PX = 1.7;
const HOUR_HEIGHT = `${String(60 * CALENDAR_MINUTE_PX)}px` as const;
const hourKeys = Array.from({ length: 13 }, (_, index) => `hour-${String(index)}`);
const cellKeys = Array.from({ length: 91 }, (_, index) => `cell-${String(index)}`);

function lessonGridPosition(time: string, durationMinutes: number) {
  const [start] = time.split(" — ");
  const startMinutes = timeToMinutes(start ?? "08:00");
  return {
    row: Math.max(2, Math.floor((startMinutes - 8 * 60) / 60) + 2),
    offset: (startMinutes % 60) * CALENDAR_MINUTE_PX,
    duration: Math.max(durationMinutes * CALENDAR_MINUTE_PX, 42),
  };
}

function stackTimeRange(lessons: LessonReadDTO[], timezone: string) {
  const start = Math.min(...lessons.map((lesson) => Date.parse(lesson.starts_at)));
  const end = Math.max(...lessons.map((lesson) => Date.parse(lesson.starts_at) + safeDuration(lesson.duration_minutes) * 60_000));
  const duration = Math.max(1, Math.round((end - start) / 60_000));
  return formatLessonTime(new Date(start).toISOString(), duration, timezone);
}

function lessonCountLabel(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;
  if (last === 1 && lastTwo !== 11) return `${String(count)} урок`;
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return `${String(count)} урока`;
  return `${String(count)} уроков`;
}

const statusLabels = {
  planned: "Запланировано",
  in_progress: "Идёт",
  completed: "Завершено",
  cancelled: "Отменено",
} as const;

function WarningIcon() {
  return <svg className="conflict-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9.2v4.6M12 17.1v.1" /></svg>;
}

function personName(person: { first_name: string; last_name: string; middle_name: string | null }) {
  return person.first_name + " " + person.last_name;
}

function personFullName(person: { first_name: string; last_name: string; middle_name: string | null }) {
  return [person.last_name, person.first_name, person.middle_name].filter(Boolean).join(" ");
}

function subjectTone(title: string) {
  const subject = title.trim().toLocaleLowerCase("ru-RU");
  if (subject.includes("истор")) return "orange";
  if (subject.includes("физик") || subject.includes("англий") || subject.includes("математ")) {
    return subject.includes("математ") ? "purple" : "blue";
  }
  return "green";
}

// ── Reschedule dialog state ────────────────────────────────────────────────
interface RescheduleState {
  lesson: LessonReadDTO;
  date: string;   // YYYY-MM-DD local
  time: string;   // HH:MM local
}

// ── Series conflict confirmation state ────────────────────────────────────
interface SeriesConflictState {
  payload: LessonFormPayload;
  conflicts: string[];
}

interface ConflictDrawerState {
  lessons: LessonReadDTO[];
  dateLabel: string;
}

export function SchedulePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isTeacher = user?.role === "TEACHER";
  const [selectedDay, setSelectedDay] = useState(0);
  const [weekOffset, setWeekOffset] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [view, setView] = useState<"week" | "list">("week");
  const [selectedCalendarLessonId, setSelectedCalendarLessonId] = useState<string | null>(null);
  const [conflictDrawer, setConflictDrawer] = useState<ConflictDrawerState | null>(null);
  const detailsPanelRef = useRef<HTMLDivElement>(null);
  const shouldScrollToDetails = useRef(false);
  const [createSuccess, setCreateSuccess] = useState(false);
  const [conflictPayload, setConflictPayload] = useState<LessonCreatePayload | null>(null);
  const [conflicts, setConflicts] = useState<LessonConflict[]>([]);
  const [conflictCheckError, setConflictCheckError] = useState<string | null>(null);
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [now, setNow] = useState(() => new Date().toISOString());

  // US-05: reschedule dialog
  const [rescheduleState, setRescheduleState] = useState<RescheduleState | null>(null);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [rescheduleApplying, setRescheduleApplying] = useState(false);

  // US-06: cancel confirmation dialog
  const [cancelTarget, setCancelTarget] = useState<LessonReadDTO | null>(null);
  const [cancelApplying, setCancelApplying] = useState(false);

  // US-08: temporary attendance application state
  const [attendanceApplying, setAttendanceApplying] = useState<"present" | "absent" | null>(null);

  // US-09: series conflict confirmation (instead of hard-block)
  const [seriesConflict, setSeriesConflict] = useState<SeriesConflictState | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => { setNow(new Date().toISOString()); }, 60_000);
    return () => { window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!selectedCalendarLessonId || !shouldScrollToDetails.current) return;
    shouldScrollToDetails.current = false;
    detailsPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selectedCalendarLessonId]);

  const profile = useQuery({ queryKey: queryKeys.profile, queryFn: api.profile, enabled: Boolean(user) });
  const timezone = profile.data?.timezone ?? DEFAULT_TIMEZONE;
  const days = useMemo(() => createWeekDays(now, weekOffset, timezone), [now, weekOffset, timezone]);
  const lessonFilters = useMemo(() => {
    const first = days[0];
    const last = days[6];
    if (!first || !last) throw new Error("Calendar week is incomplete");
    return {
      date_from: isTeacher || weekOffset !== 0 ? dayStartUtc(first.plainDate, timezone) : now,
      date_to: dayStartUtc(last.plainDate.add({ days: 1 }), timezone),
    };
  }, [isTeacher, now, weekOffset, days, timezone]);

  const lessons = useQuery({
    queryKey: queryKeys.lessons(lessonFilters.date_from, lessonFilters.date_to),
    queryFn: () => api.searchLessons(lessonFilters),
    enabled: Boolean(user && profile.data),
    retry: false,
    staleTime: 30_000,
  });
  const students = useQuery({ queryKey: queryKeys.teacherStudents, queryFn: api.teacherStudents, enabled: isTeacher });
  function conflictItems(error: unknown): LessonConflict[] {
    if (!(error instanceof ApiError) || !error.context) return [];
    const value = error.context.conflicts;
    return Array.isArray(value) ? value.filter((item): item is LessonConflict => Boolean(item) && typeof item === "object" && "title" in item) : [];
  }

  async function requestCreate(formPayload: LessonFormPayload, confirm_conflict = false) {
    setConflictCheckError(null);
    setCheckingConflicts(true);
    try {
      if (formPayload.recurrence) {
        const basePayload = {
          student_id: formPayload.student_id,
          title: formPayload.title,
          ...(formPayload.description !== undefined ? { description: formPayload.description } : {}),
          starts_at: formPayload.starts_at,
          duration_minutes: formPayload.duration_minutes,
        };
        const payload: LessonSeriesPayload = {
          ...basePayload,
          recurrence: "weekly",
          count: formPayload.recurrence.count,
          confirm_conflict,
        };
        try {
          await api.createLessonSeries(payload);
          setCreateOpen(false);
          setCreateSuccess(true);
          await queryClient.invalidateQueries({ queryKey: ["lessons"] });
        } catch (error) {
          const conflicts = conflictItems(error);
          if (conflicts.length && !confirm_conflict) {
            setSeriesConflict({ payload: formPayload, conflicts: conflicts.map((item) => `${item.title} — ${formatConflictRange(item.starts_at, item.duration_minutes, timezone)}`) });
          } else throw error;
        }
      } else {
        await api.createLesson({ ...formPayload, confirm_conflict });
        setCreateOpen(false);
        setCreateSuccess(true);
        await queryClient.invalidateQueries({ queryKey: ["lessons"] });
      }
    } catch (error) {
      const conflicts = conflictItems(error);
      if (conflicts.length && !confirm_conflict) {
        setConflictPayload({ ...formPayload });
        setConflicts(conflicts);
      } else setConflictCheckError(readableError(error));
    } finally {
      setCheckingConflicts(false);
    }
  }

  // ── US-05: Reschedule helpers ──────────────────────────────────────────
  function openReschedule(lesson: LessonReadDTO) {
    const local = Temporal.Instant.from(lesson.starts_at).toZonedDateTimeISO(timezone);
    setRescheduleState({
      lesson,
      date: local.toPlainDate().toString(),
      time: local.toPlainTime().toString({ smallestUnit: "minute" }),
    });
    setRescheduleError(null);
  }

  function applyReschedule() {
    if (!rescheduleState) return;
    const { lesson, date, time } = rescheduleState;
    if (!date || !time) { setRescheduleError("Укажите дату и время."); return; }
    setRescheduleApplying(true);
    try {
      const newStartsAt = lessonStartUtc(date, time, timezone);
      const nowMs = Temporal.Instant.from(now).epochMilliseconds;
      if (Date.parse(newStartsAt) <= nowMs) { setRescheduleError("Новое время должно быть в будущем."); return; }
      // Temporary US-05 local layer; backend will own validation, conflict-check and atomic persistence.
      void api.rescheduleLesson(lesson.id, newStartsAt).then(async () => {
        setRescheduleState(null);
        setSelectedCalendarLessonId(null);
        await queryClient.invalidateQueries({ queryKey: ["lessons"] });
      }).catch((error: unknown) => {
        setRescheduleError(readableError(error));
      }).finally(() => {
        setRescheduleApplying(false);
      });
      return;
    } catch {
      setRescheduleError("Некорректная дата или время в этом часовом поясе.");
    } finally { /* async mutation clears state in its own handlers */ }
  }

  // US-06: cancel with confirmation
  function applyCancel() {
    if (!cancelTarget) return;
    setCancelApplying(true);
    void api.cancelLesson(cancelTarget.id).then(async () => {
      setCancelTarget(null);
      setSelectedCalendarLessonId(null);
      await queryClient.invalidateQueries({ queryKey: ["lessons"] });
    }).catch((error: unknown) => {
      setRescheduleError(readableError(error));
    }).finally(() => {
      setCancelApplying(false);
    });
  }

  function applyAttendance(lesson: LessonReadDTO, attendance: "present" | "absent") {
    setAttendanceApplying(attendance);
    void api.updateLessonAttendance(lesson.id, attendance)
      .then(async () => {
        await queryClient.invalidateQueries({ queryKey: ["lessons"] });
      })
      .catch((error: unknown) => {
        setConflictCheckError(readableError(error));
      })
      .finally(() => {
        setAttendanceApplying(null);
      });
  }

  const selectedDate = days[selectedDay]?.iso ?? days[0]?.iso ?? "";
  const visibleItems = useMemo(() => lessons.data ?? [], [lessons.data]);

  const visibleLessons = useMemo(() => visibleItems
    .filter((lesson) => localDate(lesson.starts_at, timezone) === selectedDate)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at) || a.id.localeCompare(b.id)), [visibleItems, selectedDate, timezone]);
  const selectedCalendarLesson = visibleItems.find((lesson) => lesson.id === selectedCalendarLessonId) ?? null;
  const nowDate = useMemo(() => new Date(now), [now]);
  const selectedLessonHasConflict = selectedCalendarLesson && effectiveLessonStatus(selectedCalendarLesson, nowDate) !== "cancelled"
    ? findLessonConflicts({ startsAt: selectedCalendarLesson.starts_at, durationMinutes: selectedCalendarLesson.duration_minutes }, visibleItems.filter((lesson) => localDate(lesson.starts_at, timezone) === localDate(selectedCalendarLesson.starts_at, timezone) && effectiveLessonStatus(lesson, nowDate) !== "cancelled").map((lesson) => ({ id: lesson.id, title: lesson.title, startsAt: lesson.starts_at, durationMinutes: lesson.duration_minutes })), selectedCalendarLesson.id).length > 0
    : false;
  const overlappingLessonIds = useMemo(() => {
    const active = visibleLessons.filter((lesson) => effectiveLessonStatus(lesson, nowDate) !== "cancelled");
    return new Set(active.filter((lesson) => findLessonConflicts({ startsAt: lesson.starts_at, durationMinutes: lesson.duration_minutes }, active.map((item) => ({ id: item.id, title: item.title, startsAt: item.starts_at, durationMinutes: item.duration_minutes })), lesson.id).length > 0).map((lesson) => lesson.id));
  }, [visibleLessons, nowDate]);

  const nextLesson = visibleItems.find((lesson) => {
    return lesson.status === "planned" && Date.parse(lesson.starts_at) >= Date.parse(now);
  });
  const weekLabel = `${days[0]?.date ?? ""} — ${days[6]?.date ?? ""} ${String(days[6]?.plainDate.year ?? "")}`;

  // Computed status of selected lesson
  const selectedStatus = selectedCalendarLesson?.status ?? null;

  if (profile.isLoading) return <LoadingState label="Загружаем часовой пояс…" />;
  if (profile.isError) return <ErrorState message={readableError(profile.error)} onRetry={() => { void profile.refetch(); }} />;

  return <>
    <div className="schedule-page-heading">
      <PageHeader eyebrow="Расписание" title="Неделя занятий" description="Все запланированные уроки на текущую неделю." />
      <div className="schedule-summary-grid">
        <Card className="summary-card"><span>Занятий на неделе</span><strong>{visibleItems.length}</strong><small>{isTeacher ? "запланировано вами" : "в вашем расписании"}</small></Card>
        <Card className="summary-card summary-card--accent"><span>Ближайшее занятие</span><strong>{nextLesson ? formatLessonDateTime(nextLesson.starts_at, timezone) : "Нет занятий"}</strong><small>{nextLesson ? `${nextLesson.title} — ${personName(isTeacher ? nextLesson.student : nextLesson.teacher)}` : "Пока занятий нет"}</small></Card>
      </div>
    </div>
    {createSuccess ? <Alert>Занятие успешно создано.</Alert> : null}
    {lessons.isError ? <ErrorState message={readableError(lessons.error)} onRetry={() => void lessons.refetch()} /> : null}
    {lessons.isLoading ? <LoadingState label="Загружаем расписание…" /> : null}
    <div className="schedule-controls"><div className="schedule-view-actions"><div className="schedule-week-switcher"><button className="icon-button" type="button" aria-label="Предыдущая неделя" onClick={() => { setWeekOffset((value) => value - 1); }}>‹</button><strong>{weekLabel}</strong><button className="icon-button" type="button" aria-label="Следующая неделя" onClick={() => { setWeekOffset((value) => value + 1); }}>›</button></div><div className="schedule-view-toggle"><button className={view === "week" ? "schedule-view-toggle--active" : ""} type="button" onClick={() => { setView("week"); }}>Неделя</button><button className={view === "list" ? "schedule-view-toggle--active" : ""} type="button" onClick={() => { setView("list"); }}>Список</button></div>{isTeacher ? <button className="button button--primary" type="button" onClick={() => { setCreateSuccess(false); setCreateOpen(true); }}>＋ Создать занятие</button> : null}</div></div>
    {view === "week" ? <Card className="schedule-calendar-card"><div className="schedule-calendar" style={{ "--schedule-hours": 13, "--schedule-hour-height": HOUR_HEIGHT, gridTemplateColumns: "64px repeat(7, minmax(112px, 1fr))" } as CSSProperties}><div className="schedule-calendar__corner">Время</div>{days.map((day, index) => <button key={day.iso} type="button" className={selectedDay === index ? "schedule-calendar__day schedule-calendar__day--active" : "schedule-calendar__day"} onClick={() => { setSelectedDay(index); }}><strong>{dayNames[index]}</strong><span>{day.date}</span></button>)}{Array.from({ length: 13 }, (_, index) => <div className="schedule-calendar__hour" style={{ gridRow: index + 2 }} key={hourKeys[index]}>{String(index + 8).padStart(2, "0")}:00</div>)}{Array.from({ length: 13 * 7 }, (_, index) => <div className="schedule-calendar__cell" style={{ gridColumn: (index % 7) + 2, gridRow: Math.floor(index / 7) + 2 }} key={cellKeys[index]} />)}{days.map((day, dayIndex) => {
  const dayLessons = visibleItems.filter((lesson) => localDate(lesson.starts_at, timezone) === day.iso);
  const stacks = groupLessonStacks(dayLessons);
  return stacks.map((stack) => {
    const first = stack.lessons[0];
    if (!first) return null;

    const info = classifyStack(stack, nowDate);
    const isGroup = stack.lessons.length > 1;
    const cancelledIds = new Set(info.cancelledLessons.map((lesson) => lesson.id));
    const primaryId = info.countedLessons[0]?.id ?? first.id;
    const duration = stackDurationMinutes(stack);
    const range = stackTimeRange(stack.lessons, timezone);
    const position = lessonGridPosition(range, duration);
    const selected = !isGroup && selectedCalendarLessonId === first.id;
    const shortLesson = duration < 45;
    const openStack = () => {
      setConflictDrawer({ lessons: stack.lessons, dateLabel: `${dayNames[dayIndex] ?? ""}, ${day.date}` });
    };
    const toggleLesson = () => {
      setSelectedCalendarLessonId(selected ? null : first.id);
    };
    const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (isGroup) openStack(); else toggleLesson();
      }
    };
    const positionStyle = {
      gridColumn: dayIndex + 2,
      gridRow: `${String(position.row)} / span 1`,
      height: `${String(position.duration)}px`,
      marginTop: `${String(position.offset)}px`,
      alignSelf: "start" as const,
    };

    if (isGroup) {
      const compact = position.duration < 96;
      const calm = info.kind !== "warning";
      return <article
        key={stack.id}
        role="button"
        tabIndex={0}
        className={`schedule-stack${calm ? " schedule-stack--calm" : ""}${compact ? " schedule-stack--compact" : ""}`}
        style={{ ...positionStyle, marginLeft: ".3rem", width: "calc(100% - 1.1rem)" }}
        title={info.kind === "warning" ? `Открыть ${lessonCountLabel(info.counted)} в одно время` : "Открыть занятия в это время"}
        aria-haspopup="dialog"
        onClick={openStack}
        onKeyDown={handleKeyDown}
      >
        <span className="schedule-stack__top">
          {info.kind === "warning" ? (
            <span className="schedule-stack__kicker"><WarningIcon />Наложение</span>
          ) : info.kind === "none" ? (
            <span className="schedule-stack__kicker schedule-stack__kicker--calm">Занятия</span>
          ) : null}
          {info.kind === "warning" ? (
            <span className="schedule-stack__badge">{lessonCountLabel(info.counted)}</span>
          ) : info.kind === "neutral" ? (
            <span className="schedule-stack__badge schedule-stack__badge--calm">Пересечение</span>
          ) : null}
        </span>
        <span className="schedule-stack__items">
          {stack.lessons.map((lesson) => {
            const cancelled = cancelledIds.has(lesson.id);
            return (
              <span className={`schedule-stack__item schedule-stack__item--${cancelled ? "cancelled" : subjectTone(lesson.title)}${!cancelled && lesson.id === primaryId ? " schedule-stack__item--primary" : ""}`} key={lesson.id}>
                <strong>{lesson.title}</strong>
                {cancelled ? <em className="schedule-stack__cancelled-tag">Отменено</em> : null}
              </span>
            );
          })}
        </span>
        <span className="schedule-stack__meta">{personName(isTeacher ? first.student : first.teacher)}</span>
        <span className="schedule-stack__hint">{info.kind === "warning" ? "Открыть все →" : "Открыть →"}</span>
      </article>;
    }

    return <article
      key={first.id}
      role="button"
      tabIndex={0}
      className={`schedule-event schedule-event--${subjectTone(first.title)}${shortLesson ? " schedule-event--short" : ""}${selected ? " schedule-event--selected" : ""}`}
      style={{ ...positionStyle, marginLeft: ".3rem", width: "calc(100% - .6rem)", zIndex: selected ? 8 : 3 }}
      aria-pressed={selected}
      title="Показать детали занятия"
      onClick={toggleLesson}
      onKeyDown={handleKeyDown}
    >
      <strong>{first.title}</strong>
      <span>{personName(isTeacher ? first.student : first.teacher)}</span>
      <small>{range}</small>
    </article>;
  });
})}</div></Card> : <Card className="schedule-list-view"><div className="schedule-list-days" role="tablist" aria-label="Дни недели">{days.map((day, index) => <button key={`list-${day.iso}`} type="button" role="tab" aria-selected={selectedDay === index} className={selectedDay === index ? "schedule-day schedule-day--active" : "schedule-day"} onClick={() => { setSelectedDay(index); }}><span>{day.short}</span><strong>{day.date.split(" ")[0]}</strong><small>{day.date.split(" ")[1]}</small></button>)}</div><div className="schedule-list"><div className="schedule-list-day-heading"><strong>{dayNames[selectedDay]}</strong><span>{days[selectedDay]?.date}</span></div>{visibleLessons.length ? visibleLessons.map((lesson) => <article className={`lesson-card lesson-card--${subjectTone(lesson.title)}${overlappingLessonIds.has(lesson.id) ? " lesson-card--overlap" : ""}`} key={lesson.id}><time>{formatLessonTime(lesson.starts_at, lesson.duration_minutes, timezone)}</time><div><strong>{lesson.title}</strong><span>{isTeacher ? `Ученик: ${personName(lesson.student)}` : `Преподаватель: ${personName(lesson.teacher)}`}</span></div>{overlappingLessonIds.has(lesson.id) ? <small className="lesson-overlap-badge">Пересечение</small> : null}</article>) : <div className="schedule-empty">На этот день занятий нет</div>}</div></Card>}

    {/* ── Details panel (US-05, US-06, US-07, US-08) ─────────────────── */}
    {view === "week" && selectedCalendarLesson ? <div ref={detailsPanelRef}><Card className="selected-lesson-details" aria-live="polite">
      <div className="selected-lesson-details__heading">
        <div><span>Выбранное занятие</span><h2>{selectedCalendarLesson.title}</h2></div>
        <button type="button" className="icon-button" aria-label="Закрыть детали занятия" onClick={() => { setSelectedCalendarLessonId(null); }}>×</button>
      </div>
      <dl>
        <div><dt>Ученик</dt><dd>{personFullName(selectedCalendarLesson.student)}</dd></div>
        <div><dt>Преподаватель</dt><dd>{personFullName(selectedCalendarLesson.teacher)}</dd></div>
        <div><dt>Название</dt><dd>{selectedCalendarLesson.title}</dd></div>
        <div><dt>Время</dt><dd>{formatLessonDateTime(selectedCalendarLesson.starts_at, timezone)} — {formatLessonTime(selectedCalendarLesson.starts_at, selectedCalendarLesson.duration_minutes, timezone).split(" — ")[1]}</dd></div>
        {selectedLessonHasConflict ? <div><dt>Расписание</dt><dd><span className="lesson-overlap-badge">Пересекается с другим занятием</span></dd></div> : null}
        <div><dt>Статус</dt><dd>{selectedStatus === null ? "Статус неизвестен" : statusLabels[selectedStatus]}</dd></div>
        <div><dt>Посещение</dt><dd>{lessonAttendanceLabel(selectedCalendarLesson)}</dd></div>
      {selectedCalendarLesson.is_rescheduled ? <div><dt>Изменения</dt><dd>Перенесено</dd></div> : null}
      </dl>
      {selectedCalendarLesson.description ? <section className="selected-lesson-details__description"><h3>Описание</h3><p>{selectedCalendarLesson.description}</p></section> : null}

      {/* US-08: attendance — доступна только для in_progress и completed (Teacher) */}
      {isTeacher && (selectedStatus === "in_progress" || selectedStatus === "completed") ? (
        <div className="selected-lesson-details__actions">
          <button
            className="button button--secondary"
            type="button"
            disabled={attendanceApplying !== null}
            onClick={() => { applyAttendance(selectedCalendarLesson, "present"); }}
          >
            Присутствовал
          </button>
          <button
            className="button button--secondary"
            type="button"
            disabled={attendanceApplying !== null}
            onClick={() => { applyAttendance(selectedCalendarLesson, "absent"); }}
          >
            Отсутствовал
          </button>
        </div>
      ) : null}

      {/* US-05 & US-06: reschedule/cancel — только для planned (Teacher) */}
      {isTeacher && selectedStatus === "planned" ? (
        <div className="selected-lesson-details__actions">
          <button
            className="button button--secondary"
            type="button"
            onClick={() => { openReschedule(selectedCalendarLesson); }}
          >
            Перенести…
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => { setCancelTarget(selectedCalendarLesson); }}
          >
            Отменить занятие
          </button>
        </div>
      ) : null}
    </Card></div> : null}

    {/* ── Conflict drawer ─────────────────────────────────────────────── */}
    <Drawer
      open={Boolean(conflictDrawer)}
      eyebrow="Конфликт расписания"
      title={conflictDrawer ? `${lessonCountLabel(conflictDrawer.lessons.filter((lesson) => effectiveLessonStatus(lesson, nowDate) !== "cancelled").length)} в одно время` : "Наложение занятий"}
      description={conflictDrawer ? `${conflictDrawer.dateLabel} · ${stackTimeRange(conflictDrawer.lessons, timezone)}` : undefined}
      onClose={() => { setConflictDrawer(null); }}
    >
      <div className="conflict-drawer__notice">
        <WarningIcon />
        <p>Эти занятия пересекаются по времени. Откройте нужное, чтобы проверить детали, перенести или отменить его.</p>
      </div>
      <ul className="conflict-drawer__list">
        {conflictDrawer?.lessons.map((lesson) => {
          const status = lesson.status;
          const cancelled = effectiveLessonStatus(lesson, nowDate) === "cancelled";
          return <li key={lesson.id}>
            <button
              type="button"
              className={`conflict-drawer__lesson conflict-drawer__lesson--${subjectTone(lesson.title)}${cancelled ? " conflict-drawer__lesson--cancelled" : ""}`}
              onClick={() => {
                setConflictDrawer(null);
                shouldScrollToDetails.current = true;
                setSelectedCalendarLessonId(lesson.id);
              }}
            >
              <span className="conflict-drawer__time">{formatLessonTime(lesson.starts_at, lesson.duration_minutes, timezone)}</span>
              <span className="conflict-drawer__body">
                <strong>{lesson.title}</strong>
                <span>{isTeacher ? `Ученик: ${personName(lesson.student)}` : `Преподаватель: ${personName(lesson.teacher)}`}</span>
              </span>
              <span className={`conflict-drawer__status conflict-drawer__status--${status}`}>{statusLabels[status]}</span>
              <span className="conflict-drawer__arrow" aria-hidden="true">→</span>
            </button>
          </li>;
        })}
      </ul>
    </Drawer>

    {/* ── Create lesson dialog ─────────────────────────────────────────── */}
    <Dialog open={createOpen} title="Создать занятие" variant="lesson" onClose={() => { if (!checkingConflicts) setCreateOpen(false); }}><LessonCreateForm students={students.data ?? []} timezone={timezone} pending={checkingConflicts} serverError={conflictCheckError ?? undefined} onCancel={() => { setCreateOpen(false); }} onCreate={(payload) => { void requestCreate(payload); }} /></Dialog>

    {/* ── Single-lesson conflict dialog (US-04) ───────────────────────── */}
    <Dialog open={Boolean(conflictPayload)} title="Найдено пересечение" description="Проверьте расписание перед созданием занятия." onClose={() => { setConflictPayload(null); setConflicts([]); }}>
      <div className="conflict-warning-content">
        <p>Новое занятие пересекается с уже запланированным. Оно ещё не создано.</p>
        <div className="conflict-list" role="list" aria-label="Конфликтующие занятия">
          {conflicts.map((lesson) => <div className="conflict-item" role="listitem" key={lesson.id}><strong>{lesson.title}</strong><span>{formatConflictRange(lesson.starts_at, lesson.duration_minutes, timezone)}</span></div>)}
        </div>
        <div className="dialog__actions">
          <button className="button button--secondary" type="button" onClick={() => { setConflictPayload(null); setConflicts([]); }}>Изменить время</button>
          <button className="button button--primary" type="button" disabled={!conflictPayload || checkingConflicts} onClick={() => { if (!conflictPayload) return; void requestCreate(conflictPayload, true).finally(() => { setConflictPayload(null); setConflicts([]); }); }}>Создать несмотря на конфликт</button>
        </div>
      </div>
    </Dialog>

    {/* ── Series conflict dialog (US-09-15, US-09-16, US-09-17) ──────── */}
    <Dialog open={Boolean(seriesConflict)} title="Пересечения в серии" description="В серии обнаружены конфликты расписания." onClose={() => { if (!checkingConflicts) setSeriesConflict(null); }}>
      <div className="conflict-warning-content">
        <p>В серии занятий обнаружено {seriesConflict?.conflicts.length === 1 ? "пересечение" : "несколько пересечений"}. Серия ещё не создана.</p>
        <div className="conflict-list" role="list" aria-label="Конфликты серии">
          {seriesConflict?.conflicts.map((desc, i) => (
            <div className="conflict-item" role="listitem" key={i}><span>{desc}</span></div>
          ))}
        </div>
        <div className="dialog__actions">
          <button className="button button--secondary" type="button" onClick={() => { setSeriesConflict(null); }}>Изменить параметры</button>
          <button
            className="button button--primary"
            type="button"
            disabled={checkingConflicts}
            onClick={() => { if (seriesConflict) void requestCreate(seriesConflict.payload, true).finally(() => { setSeriesConflict(null); }); }}
          >
            Создать несмотря на конфликт
          </button>
        </div>
      </div>
    </Dialog>

    {/* ── Reschedule dialog (US-05) ────────────────────────────────────── */}
    <Dialog
      open={Boolean(rescheduleState)}
      title="Перенести занятие"
      description="Выберите новую дату и время. Остальные данные сохранятся."
      onClose={() => { setRescheduleState(null); setRescheduleError(null); }}
    >
      <div className="conflict-warning-content">
        {rescheduleError ? <p style={{ color: "var(--danger)", fontSize: "0.85rem", margin: 0 }}>{rescheduleError}</p> : null}
        <div className="form-field">
          <label htmlFor="reschedule-date">Новая дата</label>
          <input
            id="reschedule-date"
            className="input"
            type="date"
            value={rescheduleState?.date ?? ""}
            onChange={(e) => { setRescheduleError(null); setRescheduleState((s) => s ? { ...s, date: e.target.value } : s); }}
          />
        </div>
        <div className="form-field">
          <label htmlFor="reschedule-time">Новое время</label>
          <input
            id="reschedule-time"
            className="input"
            type="time"
            value={rescheduleState?.time ?? ""}
            onChange={(e) => { setRescheduleError(null); setRescheduleState((s) => s ? { ...s, time: e.target.value } : s); }}
          />
        </div>
        <div className="dialog__actions">
          <button className="button button--secondary" type="button" onClick={() => { setRescheduleState(null); setRescheduleError(null); }}>Отмена</button>
          <button className="button button--primary" type="button" disabled={rescheduleApplying} onClick={applyReschedule}>{rescheduleApplying ? "Сохраняем…" : "Сохранить перенос"}</button>
        </div>
      </div>
    </Dialog>

    {/* ── Cancel confirmation dialog (US-06) ──────────────────────────── */}
    <Dialog
      open={Boolean(cancelTarget)}
      title="Отменить занятие?"
      description={cancelTarget ? `«${cancelTarget.title}» — ${formatLessonDateTime(cancelTarget.starts_at, timezone)}` : ""}
      onClose={() => { setCancelTarget(null); }}
    >
      <div className="conflict-warning-content">
        <p>Занятие будет отменено. Это действие нельзя будет отменить автоматически. Запись занятия сохранится.</p>
        <div className="dialog__actions">
          <button className="button button--secondary" type="button" onClick={() => { setCancelTarget(null); }}>Не отменять</button>
          <button className="button button--danger" type="button" disabled={cancelApplying} onClick={applyCancel}>{cancelApplying ? "Отменяем…" : "Да, отменить занятие"}</button>
        </div>
      </div>
    </Dialog>
  </>;
}

