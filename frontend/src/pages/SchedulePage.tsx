import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Temporal } from "@js-temporal/polyfill";

import { readableError } from "../api/client";
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
import { createMockLesson, overlayMockLessons, saveMockState } from "../features/lessons/mock-lessons";
import { seriesOccurrences } from "../features/lessons/recurrence";
import { groupLessonStacks, stackDurationMinutes } from "../features/lessons/schedule-groups";
import type { LessonCreatePayload, LessonReadDTO } from "../api/types";
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
  payload: LessonCreatePayload;
  conflicts: string[]; // human-readable conflict descriptions
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
  const [conflicts, setConflicts] = useState<LessonReadDTO[]>([]);
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
  const createLesson = useMutation({
    mutationFn: api.createLesson,
    onSuccess: async () => {
      setCreateOpen(false);
      setCreateSuccess(true);
      await queryClient.invalidateQueries({ queryKey: ["lessons"] });
    },
  });

  // ── Series creation (US-09) ──────────────────────────────────────────────
  async function createSeriesNow(payload: LessonCreatePayload) {
    if (!payload.recurrence) return;
    const student = students.data?.find((item) => item.id === payload.student_id);
    if (!student || !user) throw new Error("Не найден участник занятия");
    const teacher = { id: user.id, first_name: user.first_name, last_name: user.last_name, middle_name: user.middle_name };
    const createdLessons = seriesOccurrences(payload, timezone).map((seriesItem) => {
      const occurrence: LessonCreatePayload = {
        ...payload,
        starts_at: seriesItem.startsAt,
      };
      delete occurrence.recurrence;
      return occurrence;
    });
    // Temporary US-05…US-09 local layer: writes all occurrences without intermediate invalid state.
    // Atomicity and persistence become backend responsibilities when the API exists.
    createdLessons.forEach((occ) => createMockLesson(occ, student, teacher, occ.starts_at));
    setSeriesConflict(null);
    setCreateOpen(false);
    setCreateSuccess(true);
    await queryClient.invalidateQueries({ queryKey: ["lessons"] });
  }

  async function requestCreate(payload: LessonCreatePayload) {
    setConflictCheckError(null);
    setCheckingConflicts(true);
    try {
      if (payload.recurrence) {
        // US-09: check conflicts for every occurrence, then allow teacher to confirm or abort
        const count = payload.recurrence.count;
        if (count < 2 || count > 52) {
          setConflictCheckError(`Количество занятий должно быть от 2 до 52.`);
          return;
        }
        const occurrences = seriesOccurrences(payload, timezone).map(({ startsAt }) => ({
          startsAt,
          durationMinutes: payload.duration_minutes,
        }));

        // Check conflicts: each occurrence vs existing schedule + vs each other in series
        const allConflictDescriptions: string[] = [];
        for (const [i, occ] of occurrences.entries()) {
          const from = new Date(Date.parse(occ.startsAt) - 24 * 60 * 60_000).toISOString();
          const to = new Date(Date.parse(occ.startsAt) + occ.durationMinutes * 60_000 + 24 * 60 * 60_000).toISOString();
          const existing = await api.searchLessons({ date_from: from, date_to: to });
          const existingCandidates = existing
            .filter((l) => l.status !== "cancelled")
            .map((l) => ({ id: l.id, title: l.title, startsAt: l.starts_at, durationMinutes: l.duration_minutes }));
          const found = findLessonConflicts(occ, existingCandidates);
          for (const c of found) {
            allConflictDescriptions.push(`Занятие ${String(i + 1)}: пересечение с «${c.title}» (${formatConflictRange(c.startsAt, c.durationMinutes, timezone)})`);
          }

          // Check intra-series conflicts (occurrence i vs previous occurrences)
          for (const [j, other] of occurrences.slice(0, i).entries()) {
            const otherStart = Date.parse(other.startsAt);
            const otherEnd = otherStart + other.durationMinutes * 60_000;
            const occStart = Date.parse(occ.startsAt);
            const occEnd = occStart + occ.durationMinutes * 60_000;
            if (occStart < otherEnd && occEnd > otherStart) {
              allConflictDescriptions.push(`Занятие ${String(i + 1)} пересекается с занятием ${String(j + 1)} внутри серии`);
            }
          }
        }

        if (allConflictDescriptions.length > 0) {
          // Show warning, let teacher confirm (AC-US09-17)
          setSeriesConflict({ payload, conflicts: allConflictDescriptions });
          return;
        }

        // No conflicts — create immediately
        await createSeriesNow(payload);
      } else {
        // Single lesson — existing conflict-check flow (US-04)
        const startsAt = Date.parse(payload.starts_at);
        const dateFrom = new Date(startsAt - 24 * 60 * 60_000).toISOString();
        const dateTo = new Date(startsAt + payload.duration_minutes * 60_000 + 24 * 60 * 60_000).toISOString();
        const schedule = await api.searchLessons({ date_from: dateFrom, date_to: dateTo });
        const found = findLessonConflicts(
          { startsAt: payload.starts_at, durationMinutes: payload.duration_minutes },
          schedule
            .filter((l) => l.status !== "cancelled")
            .map((lesson) => ({ id: lesson.id, title: lesson.title, startsAt: lesson.starts_at, durationMinutes: lesson.duration_minutes })),
        );
        if (found.length > 0) {
          setConflictPayload(payload);
          setConflicts(schedule.filter((l) => found.some((f) => f.id === l.id)));
        } else {
          createLesson.mutate(payload);
        }
      }
    } catch {
      setConflictCheckError("Не удалось проверить расписание. Повторите попытку.");
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
      saveMockState(lesson.id, { starts_at: newStartsAt, rescheduled: true });
      setRescheduleState(null);
      setSelectedCalendarLessonId(null);
      void queryClient.invalidateQueries({ queryKey: ["lessons"] });
    } catch {
      setRescheduleError("Некорректная дата или время в этом часовом поясе.");
    } finally {
      setRescheduleApplying(false);
    }
  }

  // US-06: cancel with confirmation
  function applyCancel() {
    if (!cancelTarget) return;
    setCancelApplying(true);
    try {
      // Temporary US-06 local layer; backend will own ownership/lifecycle checks and persistence.
      saveMockState(cancelTarget.id, { status: "cancelled" });
      setCancelTarget(null);
      setSelectedCalendarLessonId(null);
      void queryClient.invalidateQueries({ queryKey: ["lessons"] });
    } finally {
      setCancelApplying(false);
    }
  }

  function applyAttendance(lesson: LessonReadDTO, attendance: "present" | "absent") {
    setAttendanceApplying(attendance);
    try {
      // Temporary US-08 local layer; backend will own availability and persistence checks.
      saveMockState(lesson.id, { attendance });
      void queryClient.invalidateQueries({ queryKey: ["lessons"] });
    } finally {
      setAttendanceApplying(null);
    }
  }

  const selectedDate = days[selectedDay]?.iso ?? days[0]?.iso ?? "";
  const visibleItems = useMemo(() => overlayMockLessons(lessons.data ?? []), [lessons.data]);

  const visibleLessons = useMemo(() => visibleItems
    .filter((lesson) => localDate(lesson.starts_at, timezone) === selectedDate)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at) || a.id.localeCompare(b.id)), [visibleItems, selectedDate, timezone]);
  const selectedCalendarLesson = visibleItems.find((lesson) => lesson.id === selectedCalendarLessonId) ?? null;
  const selectedLessonHasConflict = selectedCalendarLesson ? findLessonConflicts({ startsAt: selectedCalendarLesson.starts_at, durationMinutes: selectedCalendarLesson.duration_minutes }, visibleItems.filter((lesson) => localDate(lesson.starts_at, timezone) === localDate(selectedCalendarLesson.starts_at, timezone)).map((lesson) => ({ id: lesson.id, title: lesson.title, startsAt: lesson.starts_at, durationMinutes: lesson.duration_minutes })), selectedCalendarLesson.id).length > 0 : false;
  const overlappingLessonIds = useMemo(() => new Set(visibleLessons.filter((lesson) => findLessonConflicts({ startsAt: lesson.starts_at, durationMinutes: lesson.duration_minutes }, visibleLessons.map((item) => ({ id: item.id, title: item.title, startsAt: item.starts_at, durationMinutes: item.duration_minutes })), lesson.id).length > 0).map((lesson) => lesson.id)), [visibleLessons]);

  const nowDate = new Date(now);
  const nextLesson = visibleItems.find((lesson) => {
    const status = effectiveLessonStatus(lesson, nowDate);
    return status === "planned" && Date.parse(lesson.starts_at) >= Date.parse(now);
  });
  const weekLabel = `${days[0]?.date ?? ""} — ${days[6]?.date ?? ""} ${String(days[6]?.plainDate.year ?? "")}`;

  // Computed status of selected lesson
  const selectedStatus = selectedCalendarLesson ? effectiveLessonStatus(selectedCalendarLesson, new Date(now)) : null;

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

    const isConflict = stack.lessons.length > 1;
    const duration = stackDurationMinutes(stack);
    const range = stackTimeRange(stack.lessons, timezone);
    const position = lessonGridPosition(range, duration);
    const selected = !isConflict && selectedCalendarLessonId === first.id;
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
        if (isConflict) openStack(); else toggleLesson();
      }
    };
    const positionStyle = {
      gridColumn: dayIndex + 2,
      gridRow: `${String(position.row)} / span 1`,
      height: `${String(position.duration)}px`,
      marginTop: `${String(position.offset)}px`,
      alignSelf: "start" as const,
    };

    if (isConflict) {
      const compact = position.duration < 96;
      return <article
        key={stack.id}
        role="button"
        tabIndex={0}
        className={`schedule-stack${compact ? " schedule-stack--compact" : ""}`}
        style={{ ...positionStyle, marginLeft: ".3rem", width: "calc(100% - 1.1rem)" }}
        title={`Открыть ${lessonCountLabel(stack.lessons.length)} в одно время`}
        aria-haspopup="dialog"
        onClick={openStack}
        onKeyDown={handleKeyDown}
      >
        <span className="schedule-stack__top">
          <span className="schedule-stack__kicker"><WarningIcon />Наложение</span>
          <span className="schedule-stack__badge">{lessonCountLabel(stack.lessons.length)}</span>
        </span>
        <span className="schedule-stack__items">
          {stack.lessons.map((lesson, index) => (
            <span className={`schedule-stack__item schedule-stack__item--${subjectTone(lesson.title)}${index === 0 ? " schedule-stack__item--primary" : ""}`} key={lesson.id}>
              <strong>{lesson.title}</strong>
            </span>
          ))}
        </span>
        <span className="schedule-stack__meta">{personName(isTeacher ? first.student : first.teacher)}</span>
        <span className="schedule-stack__hint">Открыть все →</span>
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
        <div><dt>Статус</dt><dd>{selectedStatus === "unknown" || selectedStatus === null ? "Статус неизвестен" : statusLabels[selectedStatus]}</dd></div>
        <div><dt>Посещение</dt><dd>{lessonAttendanceLabel(selectedCalendarLesson)}</dd></div>
        {selectedCalendarLesson.rescheduled ? <div><dt>Изменения</dt><dd>Перенесено</dd></div> : null}
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
      title={conflictDrawer ? `${lessonCountLabel(conflictDrawer.lessons.length)} в одно время` : "Наложение занятий"}
      description={conflictDrawer ? `${conflictDrawer.dateLabel} · ${stackTimeRange(conflictDrawer.lessons, timezone)}` : undefined}
      onClose={() => { setConflictDrawer(null); }}
    >
      <div className="conflict-drawer__notice">
        <WarningIcon />
        <p>Эти занятия пересекаются по времени. Откройте нужное, чтобы проверить детали, перенести или отменить его.</p>
      </div>
      <ul className="conflict-drawer__list">
        {conflictDrawer?.lessons.map((lesson) => {
          const status = effectiveLessonStatus(lesson, nowDate);
          return <li key={lesson.id}>
            <button
              type="button"
              className={`conflict-drawer__lesson conflict-drawer__lesson--${subjectTone(lesson.title)}`}
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
              <span className={`conflict-drawer__status${status === "unknown" ? "" : ` conflict-drawer__status--${status}`}`}>{status === "unknown" ? "Статус неизвестен" : statusLabels[status]}</span>
              <span className="conflict-drawer__arrow" aria-hidden="true">→</span>
            </button>
          </li>;
        })}
      </ul>
    </Drawer>

    {/* ── Create lesson dialog ─────────────────────────────────────────── */}
    <Dialog open={createOpen} title="Создать занятие" variant="lesson" onClose={() => { if (!createLesson.isPending) setCreateOpen(false); }}><LessonCreateForm students={students.data ?? []} timezone={timezone} pending={createLesson.isPending || checkingConflicts} serverError={conflictCheckError ?? (createLesson.isError ? readableError(createLesson.error) : undefined)} onCancel={() => { setCreateOpen(false); }} onCreate={(payload) => { void requestCreate(payload); }} /></Dialog>

    {/* ── Single-lesson conflict dialog (US-04) ───────────────────────── */}
    <Dialog open={Boolean(conflictPayload)} title="Найдено пересечение" description="Проверьте расписание перед созданием занятия." onClose={() => { if (!createLesson.isPending) { setConflictPayload(null); setConflicts([]); } }}>
      <div className="conflict-warning-content">
        <p>Новое занятие пересекается с уже запланированным. Оно ещё не создано.</p>
        <div className="conflict-list" role="list" aria-label="Конфликтующие занятия">
          {conflicts.map((lesson) => <div className="conflict-item" role="listitem" key={lesson.id}><strong>{lesson.title}</strong><span>{formatConflictRange(lesson.starts_at, lesson.duration_minutes, timezone)}</span></div>)}
        </div>
        <div className="dialog__actions">
          <button className="button button--secondary" type="button" disabled={createLesson.isPending} onClick={() => { setConflictPayload(null); setConflicts([]); }}>Изменить время</button>
          <button className="button button--primary" type="button" disabled={!conflictPayload || createLesson.isPending} onClick={() => { if (!conflictPayload) return; createLesson.mutate(conflictPayload, { onSettled: () => { setConflictPayload(null); setConflicts([]); } }); }}>Создать несмотря на конфликт</button>
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
            onClick={() => { if (seriesConflict) void createSeriesNow(seriesConflict.payload); }}
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

