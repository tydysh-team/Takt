import { useMemo, useState } from "react";

import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/ui/Card";

const days = [
  { short: "Пн", date: "12 окт." }, { short: "Вт", date: "13 окт." }, { short: "Ср", date: "14 окт." },
  { short: "Чт", date: "15 окт." }, { short: "Пт", date: "16 окт." }, { short: "Сб", date: "17 окт." }, { short: "Вс", date: "18 окт." },
];
const lessons = [
  { day: 0, time: "10:00 — 10:45", title: "Математика", person: "Анна Петрова", tone: "purple" },
  { day: 1, time: "15:15 — 16:00", title: "Английский язык", person: "Мария Смирнова", tone: "blue" },
  { day: 2, time: "10:00 — 10:45", title: "Физика", person: "Илья Волков", tone: "orange" },
  { day: 3, time: "17:00 — 17:45", title: "Математика", person: "Анна Петрова", tone: "purple" },
  { day: 4, time: "12:00 — 12:45", title: "Английский язык", person: "Мария Смирнова", tone: "blue" },
];

export function SchedulePage() {
  const [selectedDay, setSelectedDay] = useState(0);
  const visibleLessons = useMemo(() => lessons.filter((lesson) => lesson.day === selectedDay), [selectedDay]);

  return <>
    <PageHeader eyebrow="Расписание" title="Неделя занятий" description="Все запланированные уроки на текущую неделю." />
    <div className="schedule-summary-grid">
      <Card className="summary-card"><span>Занятий на неделе</span><strong>12</strong><small>2 часа 45 минут</small></Card>
      <Card className="summary-card summary-card--accent"><span>Ближайшее занятие</span><strong>Сегодня, 15:15</strong><small>Английский язык · 45 минут</small></Card>
    </div>
    <Card className="schedule-card">
      <div className="schedule-toolbar"><button className="icon-button button button--secondary" type="button" aria-label="Предыдущая неделя">‹</button><strong>12 — 18 октября 2026</strong><button className="icon-button button button--secondary" type="button" aria-label="Следующая неделя">›</button></div>
      <div className="schedule-days" role="tablist" aria-label="Дни недели">
        {days.map((day, index) => <button key={day.short} type="button" role="tab" aria-selected={selectedDay === index} className={selectedDay === index ? "schedule-day schedule-day--active" : "schedule-day"} onClick={() => { setSelectedDay(index); }}><span>{day.short}</span><strong>{day.date.split(" ")[0]}</strong><small>{day.date.split(" ")[1]}</small></button>)}
      </div>
      <div className="schedule-list">{visibleLessons.length ? visibleLessons.map((lesson) => <article className={`lesson-card lesson-card--${lesson.tone}`} key={`${lesson.day}-${lesson.time}`}><time>{lesson.time}</time><div><strong>{lesson.title}</strong><span>{lesson.person}</span></div><button className="button button--secondary" type="button">Подробнее</button></article>) : <div className="schedule-empty">На этот день занятий нет</div>}</div>
    </Card>
  </>;
}
