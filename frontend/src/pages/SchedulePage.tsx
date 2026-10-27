import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { readableError } from "../api/client";
import { api, queryKeys } from "../api/queries";
import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/ui/Card";
import { Dialog } from "../components/ui/Dialog";
import { Alert, ErrorState, LoadingState } from "../components/ui/Feedback";
import { useAuth } from "../features/auth/auth-context";
import { LessonCreateForm } from "../features/lessons/LessonCreateForm";
import { findLessonConflicts, formatConflictRange } from "../features/lessons/conflict-check";
import { createMockLesson, effectiveStatus, overlayMockLessons, saveMockState } from "../features/lessons/mock-lessons";
import type { LessonCreatePayload, LessonReadDTO } from "../api/types";
import { dayStartUtc, formatLessonDateTime, formatLessonTime, localDate, localDayOfWeek, weekDays } from "../shared/lesson-time";
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

function lessonGridPosition(time: string, durationMinutes: number) {
  const [start] = time.split(" — ");
  const startMinutes = timeToMinutes(start ?? "08:00");
  return {
    row: Math.max(2, Math.floor((startMinutes - 8 * 60) / 60) + 2),
    offset: startMinutes % 60,
    duration: durationMinutes,
  };
}

function lessonLanes(lessons: LessonReadDTO[], timezone: string) {
  const intervals = lessons.map((lesson) => {
    const start = timeToMinutes(formatLessonTime(lesson.starts_at, lesson.duration_minutes, timezone).split(" — ")[0] ?? "08:00");
    return { lesson, start, end: start + lesson.duration_minutes };
  }).sort((a, b) => a.start - b.start);
  const assignments = new Map<string, { lane: number; count: number; overlaps: boolean }>();
  let group: typeof intervals = [];
  let groupEnd = -1;
  const placeGroup = () => {
    if (group.length === 0) return;
    const laneEnds: number[] = [];
    const placed: { id: string; lane: number }[] = [];
    for (const interval of group) {
      let lane = laneEnds.findIndex((end) => end <= interval.start);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = interval.end;
      placed.push({ id: interval.lesson.id, lane });
    }
    const overlaps = group.length > 1;
    for (const item of placed) assignments.set(item.id, { ...item, count: laneEnds.length, overlaps });
    group = [];
    groupEnd = -1;
  };
  for (const interval of intervals) {
    if (group.length > 0 && interval.start >= groupEnd) placeGroup();
    group.push(interval);
    groupEnd = Math.max(groupEnd, interval.end);
  }
  placeGroup();
  return assignments;
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

export function SchedulePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isTeacher = user?.role === "TEACHER";
  const [selectedDay, setSelectedDay] = useState(0);
  const [weekOffset, setWeekOffset] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [view, setView] = useState<"week" | "list">("week");
  const [selectedCalendarLessonId, setSelectedCalendarLessonId] = useState<string | null>(null);
  const detailsPanelRef = useRef<HTMLDivElement>(null);
  const [createSuccess, setCreateSuccess] = useState(false);
  const [conflictPayload, setConflictPayload] = useState<LessonCreatePayload | null>(null);
  const [conflicts, setConflicts] = useState<LessonReadDTO[]>([]);
  const [conflictCheckError, setConflictCheckError] = useState<string | null>(null);
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [now, setNow] = useState(() => new Date().toISOString());
  useEffect(() => {
    const timer = window.setInterval(() => { setNow(new Date().toISOString()); }, 60_000);
    return () => { window.clearInterval(timer); };
  }, []);
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
  async function requestCreate(payload: LessonCreatePayload) {
    setConflictCheckError(null);
    setCheckingConflicts(true);
    try {
      const startsAt = Date.parse(payload.starts_at);
      const dateFrom = new Date(startsAt - 24 * 60 * 60_000).toISOString();
      const dateTo = new Date(startsAt + payload.duration_minutes * 60_000 + 24 * 60 * 60_000).toISOString();
      const schedule = await api.searchLessons({ date_from: dateFrom, date_to: dateTo });
      const found = findLessonConflicts(
        { startsAt: payload.starts_at, durationMinutes: payload.duration_minutes },
        schedule.map((lesson) => ({ id: lesson.id, title: lesson.title, startsAt: lesson.starts_at, durationMinutes: lesson.duration_minutes })),
      );
      if (payload.recurrence) {
        const student = students.data?.find((item) => item.id === payload.student_id);
        if (!student || !user) throw new Error("Не найден участник занятия");
        const occurrences = Array.from({ length: payload.recurrence.count }, (_, index) => ({ ...payload, recurrence: undefined, starts_at: new Date(Date.parse(payload.starts_at) + index * 7 * 24 * 60 * 60_000).toISOString() }));
        const conflictsInSeries: boolean[] = [];
        const conflictingLessons: LessonReadDTO[] = [];
        for (const occurrence of occurrences) {
          const from = Date.parse(occurrence.starts_at) - 24 * 60 * 60_000;
          const to = Date.parse(occurrence.starts_at) + occurrence.duration_minutes * 60_000 + 24 * 60 * 60_000;
          const existing = await api.searchLessons({ date_from: new Date(from).toISOString(), date_to: new Date(to).toISOString() });
          conflictsInSeries.push(findLessonConflicts({ startsAt: occurrence.starts_at, durationMinutes: occurrence.duration_minutes }, existing.map((item) => ({ id: item.id, title: item.title, startsAt: item.starts_at, durationMinutes: item.duration_minutes }))).length > 0);
        }
        if (conflictsInSeries.some(Boolean)) { setConflictCheckError("В серии есть пересечения с расписанием. Измените дату или время."); return; }
        if (!window.confirm(`Создать серию из ${occurrences.length} занятий каждую неделю?`)) return;
        const teacher = { id: user.id, first_name: user.first_name, last_name: user.last_name, middle_name: user.middle_name };
        occurrences.forEach((occurrence) => createMockLesson(occurrence, student, teacher, occurrence.starts_at));
        setCreateOpen(false); setCreateSuccess(true); await queryClient.invalidateQueries({ queryKey: ["lessons"] });
      } else createLesson.mutate(payload);
    } catch {
      setConflictCheckError("Не удалось проверить расписание. Повторите попытку.");
    } finally {
      setCheckingConflicts(false);
    }
  }

  const selectedDate = days[selectedDay]?.iso ?? days[0]?.iso ?? "";
  const visibleItems = useMemo(() => overlayMockLessons(lessons.data ?? []), [lessons.data]);

  const visibleLessons = useMemo(() => visibleItems.filter((lesson) => localDate(lesson.starts_at, timezone) === selectedDate), [visibleItems, selectedDate, timezone]);
  const selectedCalendarLesson = visibleItems.find((lesson) => lesson.id === selectedCalendarLessonId) ?? null;
  const selectedLessonHasConflict = selectedCalendarLesson ? findLessonConflicts({ startsAt: selectedCalendarLesson.starts_at, durationMinutes: selectedCalendarLesson.duration_minutes }, visibleItems.filter((lesson) => localDate(lesson.starts_at, timezone) === localDate(selectedCalendarLesson.starts_at, timezone)).map((lesson) => ({ id: lesson.id, title: lesson.title, startsAt: lesson.starts_at, durationMinutes: lesson.duration_minutes })), selectedCalendarLesson.id).length > 0 : false;
  const overlappingLessonIds = useMemo(() => new Set(visibleLessons.filter((lesson) => findLessonConflicts({ startsAt: lesson.starts_at, durationMinutes: lesson.duration_minutes }, visibleLessons.map((item) => ({ id: item.id, title: item.title, startsAt: item.starts_at, durationMinutes: item.duration_minutes })), lesson.id).length > 0).map((lesson) => lesson.id)), [visibleLessons]);
  const minDayWidth = useMemo(() => {
    const maxLanes = days.reduce((max, day) => {
      const dayLessons = visibleItems.filter((lesson) => localDate(lesson.starts_at, timezone) === day.iso);
      const placements = lessonLanes(dayLessons, timezone);
      return Math.max(max, ...Array.from(placements.values(), (placement) => placement.count), 1);
    }, 1);
    return Math.max(112, maxLanes * 36);
  }, [days, visibleItems, timezone]);

  const nextLesson = visibleItems.find((lesson) => Date.parse(lesson.starts_at) >= Date.parse(now));
  const weekLabel = `${days[0]?.date ?? ""} — ${days[6]?.date ?? ""} ${String(days[6]?.plainDate.year ?? "")}`;

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
    <div className="schedule-controls"><div className="schedule-view-actions"><div className="schedule-week-switcher"><button className="icon-button" type="button" aria-label="Предыдущая неделя" onClick={() => setWeekOffset((value) => value - 1)}>‹</button><strong>{weekLabel}</strong><button className="icon-button" type="button" aria-label="Следующая неделя" onClick={() => setWeekOffset((value) => value + 1)}>›</button></div><div className="schedule-view-toggle"><button className={view === "week" ? "schedule-view-toggle--active" : ""} type="button" onClick={() => setView("week")}>Неделя</button><button className={view === "list" ? "schedule-view-toggle--active" : ""} type="button" onClick={() => setView("list")}>Список</button></div>{isTeacher ? <button className="button button--primary" type="button" onClick={() => { setCreateSuccess(false); setCreateOpen(true); }}>＋ Создать занятие</button> : null}</div></div>
    {view === "week" ? <Card className="schedule-calendar-card"><div className="schedule-calendar" style={{ "--schedule-hours": 13, "--schedule-day-min": `${minDayWidth}px` } as CSSProperties}><div className="schedule-calendar__corner">Время</div>{days.map((day, index) => <button key={day.iso} type="button" className={selectedDay === index ? "schedule-calendar__day schedule-calendar__day--active" : "schedule-calendar__day"} onClick={() => setSelectedDay(index)}><strong>{dayNames[index]}</strong><span>{day.date}</span></button>)}{Array.from({ length: 13 }, (_, index) => <div className="schedule-calendar__hour" style={{ gridRow: index + 2 }} key={`hour-${index}`}>{String(index + 8).padStart(2, "0")}:00</div>)}{Array.from({ length: 13 * 7 }, (_, index) => <div className="schedule-calendar__cell" style={{ gridColumn: (index % 7) + 2, gridRow: Math.floor(index / 7) + 2 }} key={`cell-${index}`} />)}{days.map((day, dayIndex) => {
  const dayLessons = visibleItems.filter((lesson) => localDate(lesson.starts_at, timezone) === day.iso);
  const lanes = lessonLanes(dayLessons, timezone);
  return dayLessons.map((lesson) => {
    const time = formatLessonTime(lesson.starts_at, lesson.duration_minutes, timezone);
    const position = lessonGridPosition(time, lesson.duration_minutes);
    const placement = lanes.get(lesson.id) ?? { lane: 0, count: 1, overlaps: false };
    const selected = selectedCalendarLessonId === lesson.id;
    const expandedTracks = Math.min(3, placement.count);
    const expandedStart = Math.min(placement.lane, placement.count - expandedTracks);
    const eventWidth = !placement.overlaps ? "calc(100% - .6rem)" : selected ? `calc((100% / ${placement.count}) * ${expandedTracks} - .6rem)` : `calc(100% / ${placement.count} - .6rem)`;
    const eventLeft = !placement.overlaps ? ".3rem" : `calc((100% / ${placement.count}) * ${selected ? expandedStart : placement.lane} + .3rem)`;
    const scrollToDetails = (event: MouseEvent<HTMLButtonElement>) => { event.stopPropagation(); detailsPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); };
    const shortLesson = lesson.duration_minutes < 45;
    return <article role="button" tabIndex={0} className={`schedule-event schedule-event--${subjectTone(lesson.title)}${placement.overlaps ? " schedule-event--overlap" : ""}${shortLesson ? " schedule-event--short" : ""}${selected ? " schedule-event--selected" : ""}`} style={{ gridColumn: dayIndex + 2, gridRow: `${position.row} / span 1`, height: `${position.duration}px`, marginTop: `${position.offset}px`, width: eventWidth, marginLeft: eventLeft, alignSelf: "start" }} aria-pressed={selected} title="Показать детали занятия" onClick={() => setSelectedCalendarLessonId(selected ? null : lesson.id)} onKeyDown={(event: KeyboardEvent<HTMLElement>) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedCalendarLessonId(selected ? null : lesson.id); } }} key={lesson.id}><strong>{lesson.title}</strong><span>{personName(isTeacher ? lesson.student : lesson.teacher)}</span>{!shortLesson ? <small>{time}</small> : null}{selected ? <button type="button" className="schedule-event__more" onClick={scrollToDetails} onKeyDown={(event) => event.stopPropagation()}>Подробнее ↓</button> : null}</article>;
  });
})}</div></Card> : <Card className="schedule-list-view"><div className="schedule-list-days" role="tablist" aria-label="Дни недели">{days.map((day, index) => <button key={`list-${day.iso}`} type="button" role="tab" aria-selected={selectedDay === index} className={selectedDay === index ? "schedule-day schedule-day--active" : "schedule-day"} onClick={() => setSelectedDay(index)}><span>{day.short}</span><strong>{day.date.split(" ")[0]}</strong><small>{day.date.split(" ")[1]}</small></button>)}</div><div className="schedule-list"><div className="schedule-list-day-heading"><strong>{dayNames[selectedDay]}</strong><span>{days[selectedDay]?.date}</span></div>{visibleLessons.length ? visibleLessons.map((lesson) => <article className={`lesson-card lesson-card--${subjectTone(lesson.title)}${overlappingLessonIds.has(lesson.id) ? " lesson-card--overlap" : ""}`} key={lesson.id}><time>{formatLessonTime(lesson.starts_at, lesson.duration_minutes, timezone)}</time><div><strong>{lesson.title}</strong><span>{isTeacher ? `Ученик: ${personName(lesson.student)}` : `Преподаватель: ${personName(lesson.teacher)}`}</span></div>{overlappingLessonIds.has(lesson.id) ? <small className="lesson-overlap-badge">Пересечение</small> : null}</article>) : <div className="schedule-empty">На этот день занятий нет</div>}</div></Card>}
    {view === "week" && selectedCalendarLesson ? <div ref={detailsPanelRef}><Card className="selected-lesson-details" aria-live="polite">
      <div className="selected-lesson-details__heading">
        <div><span>Выбранное занятие</span><h2>{selectedCalendarLesson.title}</h2></div>
        <button type="button" className="icon-button" aria-label="Закрыть детали занятия" onClick={() => setSelectedCalendarLessonId(null)}>×</button>
      </div>
      <dl>
        <div><dt>Время</dt><dd>{formatLessonDateTime(selectedCalendarLesson.starts_at, timezone)} — {formatLessonTime(selectedCalendarLesson.starts_at, selectedCalendarLesson.duration_minutes, timezone).split(" — ")[1]}</dd></div>
        <div><dt>{isTeacher ? "Ученик" : "Преподаватель"}</dt><dd>{personFullName(isTeacher ? selectedCalendarLesson.student : selectedCalendarLesson.teacher)}</dd></div>
        {selectedCalendarLesson.description ? <div><dt>Описание</dt><dd>{selectedCalendarLesson.description}</dd></div> : null}
        {selectedLessonHasConflict ? <div><dt>Расписание</dt><dd><span className="lesson-overlap-badge">Пересекается с другим занятием</span></dd></div> : null}
        <div><dt>Статус</dt><dd>{{ planned: "Запланировано", in_progress: "Идёт", completed: "Завершено", cancelled: "Отменено" }[effectiveStatus(selectedCalendarLesson, Date.parse(now))]}</dd></div>
        <div><dt>Посещение</dt><dd>{{ not_set: "Не отмечено", present: "Присутствовал", absent: "Отсутствовал" }[selectedCalendarLesson.attendance ?? "not_set"]}</dd></div>
        {selectedCalendarLesson.rescheduled ? <div><dt>Изменения</dt><dd>Перенесено</dd></div> : null}
      </dl>
      {isTeacher && effectiveStatus(selectedCalendarLesson, Date.parse(now)) !== "cancelled" && Date.parse(now) >= Date.parse(selectedCalendarLesson.starts_at) ? <div className="selected-lesson-details__actions"><button className="button button--secondary" type="button" onClick={() => { saveMockState(selectedCalendarLesson.id, { attendance: "present" }); void queryClient.invalidateQueries({ queryKey: ["lessons"] }); }}>Присутствовал</button><button className="button button--secondary" type="button" onClick={() => { saveMockState(selectedCalendarLesson.id, { attendance: "absent" }); void queryClient.invalidateQueries({ queryKey: ["lessons"] }); }}>Отсутствовал</button></div> : null}
      {isTeacher && effectiveStatus(selectedCalendarLesson, Date.parse(now)) === "planned" ? <div className="selected-lesson-details__actions"><button className="button button--secondary" type="button" onClick={() => { saveMockState(selectedCalendarLesson.id, { starts_at: new Date(Date.parse(selectedCalendarLesson.starts_at) + 86400000).toISOString(), rescheduled: true }); void queryClient.invalidateQueries({ queryKey: ["lessons"] }); }}>Перенести на завтра</button><button className="button button--secondary" type="button" onClick={() => { saveMockState(selectedCalendarLesson.id, { status: "cancelled" }); setSelectedCalendarLessonId(null); void queryClient.invalidateQueries({ queryKey: ["lessons"] }); }}>Отменить занятие</button></div> : null}
    </Card></div> : null}
    <Dialog open={createOpen} title="Создать занятие" variant="lesson" onClose={() => { if (!createLesson.isPending) setCreateOpen(false); }}><LessonCreateForm students={students.data ?? []} timezone={timezone} pending={createLesson.isPending || checkingConflicts} serverError={conflictCheckError ?? (createLesson.isError ? readableError(createLesson.error) : undefined)} onCancel={() => { setCreateOpen(false); }} onCreate={requestCreate} /></Dialog>
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
  </>;
}










