import { useMemo, useState, type FormEvent } from "react";

import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/ui/Card";
import { Dialog } from "../components/ui/Dialog";

type Section = "schedule" | "homework";

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
const assignments = [
  { title: "Решить задачи 5–12", description: "Стр. 42–44, № 5–12", subject: "История", student: "Анна Петрова", due: "14 окт. 2026, 23:59", status: "На проверке", tone: "green" },
  { title: "Подготовить эссе", description: "Мой любимый город", subject: "Английский", student: "Иван Смирнов", due: "15 окт. 2026, 23:59", status: "Назначено", tone: "blue" },
  { title: "Повторить формулы", description: "Глава 3, основные формулы", subject: "Физика", student: "Мария Иванова", due: "13 окт. 2026, 23:59", status: "Просрочено", tone: "purple" },
  { title: "Упражнения 3–6", description: "Стр. 28, упр. 3–6", subject: "Английский", student: "Алексей Воронов", due: "16 окт. 2026, 23:59", status: "Назначено", tone: "blue" },
  { title: "Подготовка к ЕГЭ", description: "Вариант 4, задания 1–10", subject: "История", student: "Никита Орлов", due: "10 окт. 2026, 23:59", status: "Просрочено", tone: "green" },
  { title: "Лабораторная работа", description: "Отчёт по теме «Движение»", subject: "Физика", student: "Иван Смирнов", due: "12 окт. 2026, 23:59", status: "Проверено", tone: "purple" },
  { title: "Прочитать главы 4–5", description: "Подготовиться к обсуждению", subject: "Литература", student: "Анна Петрова", due: "17 окт. 2026, 23:59", status: "Назначено", tone: "pink" },
  { title: "Тест по теме Present Perfect", description: "Онлайн-тест (20 вопросов)", subject: "Английский", student: "Мария Иванова", due: "11 окт. 2026, 23:59", status: "Проверено", tone: "blue" },
];

function ScheduleView() {
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

function HomeworkView() {
  const [items, setItems] = useState(assignments);
  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState("Все предметы");
  const [status, setStatus] = useState("Все статусы");
  const [selected, setSelected] = useState(assignments[0]!);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const filtered = items.filter((item) => {
    const haystack = `${item.title} ${item.description} ${item.subject} ${item.student}`.toLowerCase();
    return haystack.includes(search.toLowerCase()) && (subject === "Все предметы" || item.subject === subject) && (status === "Все статусы" || item.status === status);
  });
  const subjects = ["Все предметы", ...new Set(items.map((item) => item.subject))];
  const statuses = ["Все статусы", ...new Set(items.map((item) => item.status))];
  const addAssignment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = { title: String(data.get("title") || "Новое задание"), description: String(data.get("description") || ""), subject: String(data.get("subject") || "Математика"), student: String(data.get("student") || "Анна Петрова"), due: String(data.get("due") || "18 окт. 2026, 23:59"), status: "Назначено", tone: "green" } as const;
    setItems((current) => [next, ...current]);
    setSelected(next);
    setDialogOpen(false);
  };
  return <>
    <PageHeader eyebrow="Домашние задания" title="Задания и проверка" description="Выдавайте, отслеживайте и проверяйте домашнюю работу учеников." />
    <div className="homework-summary-grid"><Card className="summary-card"><span>На проверке</span><strong>8</strong><small>работ от учеников</small></Card><Card className="summary-card"><span>Просрочено</span><strong>2</strong><small>задания</small></Card></div>
    <div className="homework-toolbar homework-toolbar--filters"><input className="input homework-search" value={search} onChange={(event) => { setSearch(event.target.value); }} placeholder="⌕  Поиск по заданиям, ученикам или предметам…" aria-label="Поиск по заданиям" /><select className="input homework-filter" value={subject} onChange={(event) => { setSubject(event.target.value); }}>{subjects.map((value) => <option key={value}>{value}</option>)}</select><select className="input homework-filter" value={status} onChange={(event) => { setStatus(event.target.value); }}>{statuses.map((value) => <option key={value}>{value}</option>)}</select><button className="button button--primary" type="button" onClick={() => { setDialogOpen(true); }}>+ Выдать задание</button></div>
    <div className="homework-layout"><Card className="assignment-table" id="homework-list"><div className="assignment-table__head"><span>Задание</span><span>Предмет</span><span>Ученик</span><span>Срок сдачи</span><span>Статус</span><span /></div>{filtered.map((item) => <div className={`assignment-row ${selected.title === item.title ? "assignment-row--selected" : ""}`} key={`${item.title}-${item.student}`} role="button" tabIndex={0} onClick={() => { setSelected(item); setMenu(null); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { setSelected(item); setMenu(null); } }}><span className="assignment-check" /><span className="assignment-main"><strong>{item.title}</strong><small>{item.description}</small></span><span className={`subject-pill subject-pill--${item.tone}`}>{item.subject}</span><span className="assignment-student">{item.student}</span><span className={`assignment-due assignment-due--${item.status === "Просрочено" ? "overdue" : ""}`}>{item.due}</span><span className={`badge assignment-status assignment-status--${item.status === "Просрочено" ? "overdue" : item.status === "На проверке" ? "review" : item.status === "Проверено" ? "success" : "pending"}`}>{item.status}</span><span className="assignment-menu-wrap"><button className="assignment-menu" type="button" aria-label={`Действия для ${item.title}`} onClick={(event) => { event.stopPropagation(); setMenu(menu === item.title ? null : item.title); }}>⋮</button>{menu === item.title ? <span className="assignment-menu-popover"><button type="button" onClick={() => { setSelected(item); setMenu(null); }}>Открыть</button><button type="button" onClick={() => { setItems((current) => current.filter((entry) => entry !== item)); setMenu(null); }}>Удалить</button></span> : null}</span></div>)}</Card><aside className="homework-sidebar"><Card className="selected-assignment"><div className="selected-assignment__title"><span>Выбранное задание</span><span className="badge assignment-status--review">{selected.status}</span></div><h2>{selected.title}</h2><p>{selected.description}</p><dl><div><dt>Предмет</dt><dd>{selected.subject}</dd></div><div><dt>Ученик</dt><dd>{selected.student}</dd></div><div><dt>Срок сдачи</dt><dd>{selected.due}</dd></div></dl><p className="selected-assignment__description">Решите задания и прикрепите ответ. Ответ должен быть подробным и содержать все вычисления.</p><div className="selected-assignment__actions"><button className="button button--primary" type="button">Открыть ответ</button><button className="button button--ghost" type="button">Оставить комментарий</button></div></Card><Card className="deadlines-card"><div className="section-heading section-heading--compact"><h3>Ближайшие сроки сдачи</h3><a href="#homework-list">Все задания →</a></div>{items.slice(0, 4).map((item) => <button type="button" key={`deadline-${item.title}`} onClick={() => { setSelected(item); }}><time>{item.due.slice(0, 6)}</time><span><strong>{item.title}</strong><small>{item.student} · {item.subject}</small></span><span className={`badge assignment-status--${item.status === "На проверке" ? "review" : "pending"}`}>{item.status}</span></button>)}</Card></aside></div>
    <Dialog open={dialogOpen} title="Выдать задание" description="Заполните основные данные задания." onClose={() => { setDialogOpen(false); }}><form className="form-stack" onSubmit={addAssignment}><label className="form-field"><span>Название задания</span><input className="input" name="title" required placeholder="Например, Решить задачи 5–12" /></label><label className="form-field"><span>Описание</span><textarea className="input textarea" name="description" placeholder="Страницы, номера или инструкция" /></label><div className="form-grid"><label className="form-field"><span>Предмет</span><select className="input" name="subject"><option>Математика</option><option>История</option><option>Физика</option><option>Английский</option></select></label><label className="form-field"><span>Ученик</span><select className="input" name="student"><option>Анна Петрова</option><option>Иван Смирнов</option><option>Мария Иванова</option></select></label></div><label className="form-field"><span>Срок сдачи</span><input className="input" name="due" type="datetime-local" /></label><div className="dialog__actions"><button className="button button--secondary" type="button" onClick={() => { setDialogOpen(false); }}>Отмена</button><button className="button button--primary" type="submit">Выдать задание</button></div></form></Dialog>
  </>;
}

export function PlaceholderPage({ section }: { section: Section }) { return section === "schedule" ? <ScheduleView /> : <HomeworkView />; }
