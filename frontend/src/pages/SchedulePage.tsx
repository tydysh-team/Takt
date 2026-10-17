import { useMemo, useState, type FormEvent } from "react";
import type { CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";

import { api, queryKeys } from "../api/queries";
import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/ui/Card";
import { Dialog } from "../components/ui/Dialog";
import { useAuth } from "../features/auth/auth-context";

const monthNames = ["янв.", "февр.", "марта", "апр.", "мая", "июня", "июля", "авг.", "сент.", "окт.", "нояб.", "дек."];
function createWeekDays(offset: number) {
  const first = new Date(Date.UTC(2026, 9, 13 + offset * 7));
  return Array.from({ length: 7 }, (_, index) => { const date = new Date(first); date.setUTCDate(first.getUTCDate() + index); return { short: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"][index], date: `${date.getUTCDate()} ${monthNames[date.getUTCMonth()]}`, iso: date.toISOString().slice(0, 10) }; });
}
type Lesson = { day: number; time: string; title: string; person: string; tone: string };
const initialLessons: Lesson[] = [
  { day: 0, time: "10:00 — 10:45", title: "Математика", person: "Анна Петрова", tone: "purple" },
  { day: 1, time: "15:15 — 16:00", title: "Английский язык", person: "Мария Смирнова", tone: "blue" },
  { day: 2, time: "10:00 — 10:45", title: "Физика", person: "Илья Волков", tone: "orange" },
  { day: 3, time: "17:00 — 17:45", title: "Математика", person: "Анна Петрова", tone: "purple" },
  { day: 4, time: "12:00 — 12:45", title: "Английский язык", person: "Мария Смирнова", tone: "blue" },
];

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function lessonGridPosition(time: string) {
  const [start, end] = time.split(" — ");
  const startMinutes = timeToMinutes(start ?? "08:00");
  const endMinutes = timeToMinutes(end ?? "08:45");
  return { row: Math.floor((startMinutes - 8 * 60) / 60) + 2, span: Math.max(1, Math.ceil((endMinutes - startMinutes) / 60)) };
}

export function SchedulePage() {
  const { user } = useAuth();
  const isTeacher = user?.role === "TEACHER";
  const students = useQuery({ queryKey: queryKeys.students, queryFn: api.students, enabled: isTeacher });
  const [selectedDay, setSelectedDay] = useState(0);
  const [weekOffset, setWeekOffset] = useState(0);
  const [items, setItems] = useState(initialLessons);
  const [createOpen, setCreateOpen] = useState(false);
  const [view, setView] = useState<"week" | "list">("week");
  const days = useMemo(() => createWeekDays(weekOffset), [weekOffset]);
  const selectedDate = days[selectedDay]?.iso ?? days[0].iso;
  const visibleItems = weekOffset === 0 ? items : [];
  const visibleLessons = useMemo(() => visibleItems.filter((lesson) => lesson.day === selectedDay), [visibleItems, selectedDay]);
  const weekLabel = `${days[0]?.date} — ${days[6]?.date} 2026`;

  const createLesson = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const date = String(data.get("date") || selectedDate);
    const day = days.findIndex((item) => item.iso === date);
    const start = String(data.get("start") || "10:00");
    const duration = String(data.get("duration") || "45");
    const student = String(data.get("student") || "Ученик");
    const subject = String(data.get("subject") || "Математика");
    const startMinutes = Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5));
    const endMinutes = startMinutes + Number(duration);
    const end = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
    setItems((current) => [...current, { day: day < 0 ? selectedDay : day, time: `${start} — ${end}`, title: subject, person: student, tone: "green" }]);
    setSelectedDay(day < 0 ? selectedDay : day);
    setCreateOpen(false);
  };

  return <>
    <div className="schedule-page-heading">
      <PageHeader eyebrow="Расписание" title="Неделя занятий" description="Все запланированные уроки на текущую неделю." />
      <div className="schedule-summary-grid">
        <Card className="summary-card"><span>Занятий на неделе</span><strong>{items.length}</strong><small>{isTeacher ? "запланировано вами" : "в вашем расписании"}</small></Card>
        <Card className="summary-card summary-card--accent"><span>Ближайшее занятие</span><strong>Сегодня, 15:15</strong><small>{items[0]?.title ?? "Пока занятий нет"} — {items[0]?.person ?? ""}</small></Card>
      </div>
    </div>
    <div className="schedule-controls"><div className="schedule-week-switcher"><button className="icon-button button button--secondary" type="button" aria-label="Предыдущая неделя" onClick={() => setWeekOffset((offset) => offset - 1)}>‹</button><strong>{weekLabel}</strong><button className="icon-button button button--secondary" type="button" aria-label="Следующая неделя" onClick={() => setWeekOffset((offset) => offset + 1)}>›</button></div><div className="schedule-view-actions"><div className="schedule-view-toggle"><button className={view === "week" ? "schedule-view-toggle--active" : ""} type="button" onClick={() => setView("week")}>Неделя</button><button className={view === "list" ? "schedule-view-toggle--active" : ""} type="button" onClick={() => setView("list")}>Список</button></div>{isTeacher ? <button className="button button--primary" type="button" onClick={() => setCreateOpen(true)}>＋ Создать занятие</button> : null}</div></div>
    {view === "week" ? <Card className="schedule-calendar-card"><div className="schedule-calendar" style={{ "--schedule-hours": 13 } as CSSProperties}><div className="schedule-calendar__corner">Время</div>{days.map((day, index) => <button key={day.iso} type="button" className={selectedDay === index ? "schedule-calendar__day schedule-calendar__day--active" : "schedule-calendar__day"} onClick={() => setSelectedDay(index)}><strong>{["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"][index]}</strong><span>{day.date}</span></button>)}{Array.from({ length: 13 }, (_, index) => <div className="schedule-calendar__hour" style={{ gridRow: index + 2 }} key={`hour-${index}`}>{String(index + 8).padStart(2, "0")}:00</div>)}{Array.from({ length: 13 * 7 }, (_, index) => <div className="schedule-calendar__cell" style={{ gridColumn: (index % 7) + 2, gridRow: Math.floor(index / 7) + 2 }} key={`cell-${index}`} />)}{visibleItems.map((lesson) => { const position = lessonGridPosition(lesson.time); return <article className={`schedule-event schedule-event--${lesson.tone}`} style={{ gridColumn: lesson.day + 2, gridRow: `${position.row} / span ${position.span}` }} key={`${lesson.day}-${lesson.time}-${lesson.person}`}><strong>{lesson.title}</strong><span>{lesson.person}</span><small>{lesson.time}</small></article>; })}</div></Card> : <Card className="schedule-list-view"><div className="schedule-list-days" role="tablist" aria-label="Дни недели">{days.map((day, index) => <button key={`list-${day.iso}`} type="button" role="tab" aria-selected={selectedDay === index} className={selectedDay === index ? "schedule-day schedule-day--active" : "schedule-day"} onClick={() => setSelectedDay(index)}><span>{day.short}</span><strong>{day.date.split(" ")[0]}</strong><small>{day.date.split(" ")[1]}</small></button>)}</div><div className="schedule-list"><div className="schedule-list-day-heading"><strong>{["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"][selectedDay]}</strong><span>{days[selectedDay]?.date}</span></div>{visibleLessons.length ? visibleLessons.map((lesson) => <article className={`lesson-card lesson-card--${lesson.tone}`} key={`${lesson.day}-${lesson.time}-${lesson.person}`}><time>{lesson.time}</time><div><strong>{lesson.title}</strong><span>{isTeacher ? `Ученик: ${lesson.person}` : `Преподаватель: ${lesson.person}`}</span></div></article>) : <div className="schedule-empty">На этот день занятий нет</div>}</div></Card>}
    <Dialog open={createOpen} title="Создать занятие" description="Выберите ученика, дату и время урока." onClose={() => setCreateOpen(false)}><form className="form-stack" onSubmit={createLesson}><label className="form-field"><span>Ученик</span><select className="input" name="student" required defaultValue=""><option value="" disabled>Выберите ученика</option>{(students.data ?? []).map((student) => <option key={student.id} value={`${student.first_name} ${student.last_name}`}>{student.first_name} {student.last_name}</option>)}<option value="Анна Петрова">Анна Петрова</option></select></label><div className="form-grid"><label className="form-field"><span>Дата</span><input className="input" type="date" name="date" defaultValue={selectedDate} required /></label><label className="form-field"><span>Время начала</span><input className="input" type="time" name="start" defaultValue="10:00" required /></label></div><div className="form-grid"><label className="form-field"><span>Предмет</span><select className="input" name="subject" defaultValue="Математика"><option>Математика</option><option>История</option><option>Физика</option><option>Английский язык</option></select></label><label className="form-field"><span>Длительность</span><select className="input" name="duration" defaultValue="45"><option value="45">45 минут</option><option value="60">1 час</option><option value="90">1 час 30 минут</option></select></label></div><div className="dialog__actions"><button className="button button--secondary" type="button" onClick={() => setCreateOpen(false)}>Отмена</button><button className="button button--primary" type="submit">Создать занятие</button></div></form></Dialog>
  </>;
}
