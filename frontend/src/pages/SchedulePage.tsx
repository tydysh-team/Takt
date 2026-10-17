import { useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { readableError } from "../api/client";
import { api, queryKeys } from "../api/queries";
import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/ui/Card";
import { Dialog } from "../components/ui/Dialog";
import { Alert, ErrorState, LoadingState } from "../components/ui/Feedback";
import { useAuth } from "../features/auth/auth-context";
import type { LessonReadDTO } from "../api/types";

const monthNames = ["янв.", "февр.", "марта", "апр.", "мая", "июня", "июля", "авг.", "сент.", "окт.", "нояб.", "дек."];
const dayNames = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
const dayShortNames = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function localDateIso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function startOfWeek(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  const day = result.getDay();
  result.setDate(result.getDate() - (day === 0 ? 6 : day - 1));
  return result;
}

function createWeekDays(offset: number) {
  const first = startOfWeek(new Date());
  first.setDate(first.getDate() + offset * 7);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(first);
    date.setDate(first.getDate() + index);
    return { short: dayShortNames[index], date: `${date.getDate()} ${monthNames[date.getMonth()]}`, iso: localDateIso(date) };
  });
}

function timeToMinutes(time: string) {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function lessonTime(lesson: LessonReadDTO) {
  const start = new Date(lesson.starts_at);
  const end = new Date(start.getTime() + 45 * 60 * 1000);
  return `${start.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })} — ${end.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
}

function lessonGridPosition(time: string) {
  const [start, end] = time.split(" — ");
  const startMinutes = timeToMinutes(start ?? "08:00");
  const endMinutes = timeToMinutes(end ?? "08:45");
  return { row: Math.max(2, Math.floor((startMinutes - 8 * 60) / 60) + 2), span: Math.max(1, Math.ceil((endMinutes - startMinutes) / 60)) };
}

function personName(person: { first_name: string; last_name: string; middle_name: string | null }) {
  return `${person.first_name} ${person.last_name}`;
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
  const [now] = useState(() => new Date());
  const days = useMemo(() => createWeekDays(weekOffset), [weekOffset]);
  const weekStart = useMemo(() => new Date(`${days[0]?.iso}T00:00:00`), [days]);
  const weekEnd = useMemo(() => new Date(`${days[6]?.iso}T00:00:00`), [days]);
  weekEnd.setDate(weekEnd.getDate() + 1);
  const lessonFilters = useMemo(() => ({
    date_from: (isTeacher || weekOffset !== 0 ? weekStart : new Date(Math.max(now.getTime(), weekStart.getTime()))).toISOString(),
    date_to: weekEnd.toISOString(),
  }), [isTeacher, now, weekOffset, weekStart, weekEnd]);
  const lessons = useQuery({
    queryKey: queryKeys.lessons(lessonFilters.date_from, lessonFilters.date_to),
    queryFn: () => api.searchLessons(lessonFilters),
    enabled: Boolean(user),
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
  const visibleItems = lessons.data ?? [];
  const visibleLessons = useMemo(() => visibleItems.filter((lesson) => localDateIso(new Date(lesson.starts_at)) === selectedDate), [visibleItems, selectedDate]);
  const nextLesson = visibleItems.filter((lesson) => new Date(lesson.starts_at).getTime() >= now.getTime())[0];
  const weekLabel = `${days[0]?.date} — ${days[6]?.date} ${new Date(`${days[6]?.iso}T00:00:00`).getFullYear()}`;

  const submitLesson = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const date = String(data.get("date") || selectedDate);
    const start = String(data.get("start") || "10:00");
    createLesson.mutate({ student_id: String(data.get("student_id")), title: String(data.get("subject") || "Математика"), starts_at: new Date(`${date}T${start}:00`).toISOString() });
  };

  return <>
    <div className="schedule-page-heading">
      <PageHeader eyebrow="Расписание" title="Неделя занятий" description="Все запланированные уроки на текущую неделю." />
      <div className="schedule-summary-grid">
        <Card className="summary-card"><span>Занятий на неделе</span><strong>{visibleItems.length}</strong><small>{isTeacher ? "запланировано вами" : "в вашем расписании"}</small></Card>
        <Card className="summary-card summary-card--accent"><span>Ближайшее занятие</span><strong>{nextLesson ? new Date(nextLesson.starts_at).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "Нет занятий"}</strong><small>{nextLesson ? `${nextLesson.title} — ${personName(isTeacher ? nextLesson.student : nextLesson.teacher)}` : "Пока занятий нет"}</small></Card>
      </div>
    </div>
    {createSuccess ? <Alert>Занятие успешно создано.</Alert> : null}
    {lessons.isError ? <ErrorState message={readableError(lessons.error)} onRetry={() => void lessons.refetch()} /> : null}
    {lessons.isLoading ? <LoadingState label="Загружаем расписание…" /> : null}
    <div className="schedule-controls"><div className="schedule-view-actions"><div className="schedule-week-switcher"><button className="icon-button" type="button" aria-label="Предыдущая неделя" onClick={() => setWeekOffset((value) => value - 1)}>‹</button><strong>{weekLabel}</strong><button className="icon-button" type="button" aria-label="Следующая неделя" onClick={() => setWeekOffset((value) => value + 1)}>›</button></div><div className="schedule-view-toggle"><button className={view === "week" ? "schedule-view-toggle--active" : ""} type="button" onClick={() => setView("week")}>Неделя</button><button className={view === "list" ? "schedule-view-toggle--active" : ""} type="button" onClick={() => setView("list")}>Список</button></div>{isTeacher ? <button className="button button--primary" type="button" onClick={() => { setCreateSuccess(false); setCreateOpen(true); }}>＋ Создать занятие</button> : null}</div></div>
    {view === "week" ? <Card className="schedule-calendar-card"><div className="schedule-calendar" style={{ "--schedule-hours": 13 } as CSSProperties}><div className="schedule-calendar__corner">Время</div>{days.map((day, index) => <button key={day.iso} type="button" className={selectedDay === index ? "schedule-calendar__day schedule-calendar__day--active" : "schedule-calendar__day"} onClick={() => setSelectedDay(index)}><strong>{dayNames[index]}</strong><span>{day.date}</span></button>)}{Array.from({ length: 13 }, (_, index) => <div className="schedule-calendar__hour" style={{ gridRow: index + 2 }} key={`hour-${index}`}>{String(index + 8).padStart(2, "0")}:00</div>)}{Array.from({ length: 13 * 7 }, (_, index) => <div className="schedule-calendar__cell" style={{ gridColumn: (index % 7) + 2, gridRow: Math.floor(index / 7) + 2 }} key={`cell-${index}`} />)}{visibleItems.map((lesson) => { const time = lessonTime(lesson); const day = new Date(lesson.starts_at).getDay(); const dayIndex = day === 0 ? 6 : day - 1; const position = lessonGridPosition(time); return <article className="schedule-event schedule-event--purple" style={{ gridColumn: dayIndex + 2, gridRow: `${position.row} / span ${position.span}` }} key={lesson.id}><strong>{lesson.title}</strong><span>{personName(isTeacher ? lesson.student : lesson.teacher)}</span><small>{time}</small></article>; })}</div></Card> : <Card className="schedule-list-view"><div className="schedule-list-days" role="tablist" aria-label="Дни недели">{days.map((day, index) => <button key={`list-${day.iso}`} type="button" role="tab" aria-selected={selectedDay === index} className={selectedDay === index ? "schedule-day schedule-day--active" : "schedule-day"} onClick={() => setSelectedDay(index)}><span>{day.short}</span><strong>{day.date.split(" ")[0]}</strong><small>{day.date.split(" ")[1]}</small></button>)}</div><div className="schedule-list"><div className="schedule-list-day-heading"><strong>{dayNames[selectedDay]}</strong><span>{days[selectedDay]?.date}</span></div>{visibleLessons.length ? visibleLessons.map((lesson) => <article className="lesson-card lesson-card--purple" key={lesson.id}><time>{lessonTime(lesson)}</time><div><strong>{lesson.title}</strong><span>{isTeacher ? `Ученик: ${personName(lesson.student)}` : `Преподаватель: ${personName(lesson.teacher)}`}</span></div></article>) : <div className="schedule-empty">На этот день занятий нет</div>}</div></Card>}
    <Dialog open={createOpen} title="Создать занятие" description="Выберите ученика, дату и время урока." onClose={() => { if (!createLesson.isPending) setCreateOpen(false); }}><form className="form-stack" onSubmit={submitLesson}>{createLesson.isError ? <Alert tone="error">{readableError(createLesson.error)}</Alert> : null}<label className="form-field"><span>Ученик</span><select className="input" name="student_id" required defaultValue=""><option value="" disabled>Выберите ученика</option>{(students.data ?? []).map((student) => <option key={student.id} value={student.id}>{personName(student)}</option>)}</select></label><div className="form-grid"><label className="form-field"><span>Дата</span><input className="input" type="date" name="date" defaultValue={selectedDate} required /></label><label className="form-field"><span>Время начала</span><input className="input" type="time" name="start" defaultValue="10:00" required /></label></div><div className="form-grid"><label className="form-field"><span>Предмет</span><select className="input" name="subject" defaultValue="Математика"><option>Математика</option><option>История</option><option>Физика</option><option>Английский язык</option></select></label><label className="form-field"><span>Длительность</span><select className="input" name="duration" defaultValue="45"><option value="45">45 минут</option><option value="60">1 час</option><option value="90">1 час 30 минут</option></select></label></div><div className="dialog__actions"><button className="button button--secondary" type="button" disabled={createLesson.isPending} onClick={() => setCreateOpen(false)}>Отмена</button><button className="button button--primary" type="submit" disabled={createLesson.isPending}>{createLesson.isPending ? "Создаём…" : "Создать занятие"}</button></div></form></Dialog>
  </>;
}
