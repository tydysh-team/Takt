import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { readableError } from "../api/client";
import { api, queryKeys } from "../api/queries";
import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/ui/Card";
import { Dialog } from "../components/ui/Dialog";
import { Alert, ErrorState, LoadingState } from "../components/ui/Feedback";
import { useAuth } from "../features/auth/auth-context";
import { LessonCreateForm } from "../features/lessons/LessonCreateForm";
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
  return { row: Math.max(2, Math.floor((startMinutes - 8 * 60) / 60) + 2), span: Math.max(1, Math.min(13, Math.ceil(((startMinutes % 60) + durationMinutes) / 60))) };
}

function personName(person: { first_name: string; last_name: string; middle_name: string | null }) {
  return `${person.first_name} ${person.last_name}`;
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
  const [createSuccess, setCreateSuccess] = useState(false);
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
  const selectedDate = days[selectedDay]?.iso ?? days[0]?.iso ?? "";
  const visibleItems = useMemo(() => lessons.data ?? [], [lessons.data]);
  const visibleLessons = useMemo(() => visibleItems.filter((lesson) => localDate(lesson.starts_at, timezone) === selectedDate), [visibleItems, selectedDate, timezone]);
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
    {view === "week" ? <Card className="schedule-calendar-card"><div className="schedule-calendar" style={{ "--schedule-hours": 13 } as CSSProperties}><div className="schedule-calendar__corner">Время</div>{days.map((day, index) => <button key={day.iso} type="button" className={selectedDay === index ? "schedule-calendar__day schedule-calendar__day--active" : "schedule-calendar__day"} onClick={() => setSelectedDay(index)}><strong>{dayNames[index]}</strong><span>{day.date}</span></button>)}{Array.from({ length: 13 }, (_, index) => <div className="schedule-calendar__hour" style={{ gridRow: index + 2 }} key={`hour-${index}`}>{String(index + 8).padStart(2, "0")}:00</div>)}{Array.from({ length: 13 * 7 }, (_, index) => <div className="schedule-calendar__cell" style={{ gridColumn: (index % 7) + 2, gridRow: Math.floor(index / 7) + 2 }} key={`cell-${index}`} />)}{visibleItems.map((lesson) => { const time = formatLessonTime(lesson.starts_at, lesson.duration_minutes, timezone); const dayIndex = localDayOfWeek(lesson.starts_at, timezone) - 1; const position = lessonGridPosition(time, lesson.duration_minutes); return <article className={`schedule-event schedule-event--${subjectTone(lesson.title)}`} style={{ gridColumn: dayIndex + 2, gridRow: `${position.row} / span ${position.span}` }} key={lesson.id}><strong>{lesson.title}</strong><span>{personName(isTeacher ? lesson.student : lesson.teacher)}</span><small>{time}</small></article>; })}</div></Card> : <Card className="schedule-list-view"><div className="schedule-list-days" role="tablist" aria-label="Дни недели">{days.map((day, index) => <button key={`list-${day.iso}`} type="button" role="tab" aria-selected={selectedDay === index} className={selectedDay === index ? "schedule-day schedule-day--active" : "schedule-day"} onClick={() => setSelectedDay(index)}><span>{day.short}</span><strong>{day.date.split(" ")[0]}</strong><small>{day.date.split(" ")[1]}</small></button>)}</div><div className="schedule-list"><div className="schedule-list-day-heading"><strong>{dayNames[selectedDay]}</strong><span>{days[selectedDay]?.date}</span></div>{visibleLessons.length ? visibleLessons.map((lesson) => <article className={`lesson-card lesson-card--${subjectTone(lesson.title)}`} key={lesson.id}><time>{formatLessonTime(lesson.starts_at, lesson.duration_minutes, timezone)}</time><div><strong>{lesson.title}</strong><span>{isTeacher ? `Ученик: ${personName(lesson.student)}` : `Преподаватель: ${personName(lesson.teacher)}`}</span></div></article>) : <div className="schedule-empty">На этот день занятий нет</div>}</div></Card>}
    <Dialog open={createOpen} title="Создать занятие" variant="lesson" onClose={() => { if (!createLesson.isPending) setCreateOpen(false); }}><LessonCreateForm students={students.data ?? []} timezone={timezone} pending={createLesson.isPending} serverError={createLesson.isError ? readableError(createLesson.error) : undefined} onCancel={() => { setCreateOpen(false); }} onCreate={(payload) => { createLesson.mutate(payload); }} /></Dialog>
  </>;
}
