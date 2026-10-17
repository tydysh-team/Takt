import { useMemo, useState, type FormEvent } from "react";

import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/ui/Card";
import { Dialog } from "../components/ui/Dialog";
import { useAuth } from "../features/auth/auth-context";

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
type Assignment = (typeof assignments)[number];

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


function StudentHomeworkView() {
  const [items] = useState(assignments);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("Все статусы");
  const [selected, setSelected] = useState(assignments[0]!);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, "urgent" | "hard" | "later" | null>>({});
  const [markMenuOpen, setMarkMenuOpen] = useState(false);
  const mark = marks[selected.title] ?? null;
  const visibleItems = items.filter((item) => `${item.title} ${item.description} ${item.subject}`.toLocaleLowerCase("ru").includes(search.toLocaleLowerCase("ru")) && (status === "Все статусы" || item.status === status));

  return <>
    <div className="homework-heading"><PageHeader eyebrow="Домашние задания" title="Мои задания" description="Задания от преподавателей и сроки сдачи." /><div className="homework-summary-inline"><Card className="summary-card"><span>Нужно выполнить</span><strong className="homework-count"><span>{items.filter((item) => item.status === "Назначено").length}</span><b>+{items.filter((item) => item.status === "Просрочено").length}</b></strong><small>активных и просроченных заданий</small></Card><Card className="summary-card"><span>На проверке</span><strong>{items.filter((item) => item.status === "На проверке").length}</strong><small>работ преподавателя</small></Card></div></div>
    <div className="homework-toolbar homework-toolbar--filters"><input className="input homework-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="⌕  Поиск по заданиям или предметам…" aria-label="Поиск по заданиям" /><div className="homework-filter-row"><select className="input homework-filter" defaultValue="Все предметы"><option>Все предметы</option><option>История</option><option>Английский</option><option>Физика</option></select><select className="input homework-filter" value={status} onChange={(event) => setStatus(event.target.value)}><option>Все статусы</option>{[...new Set(items.map((item) => item.status))].map((value) => <option key={value}>{value}</option>)}</select></div></div>
    <div className="homework-layout homework-layout--student"><Card className="assignment-table" id="homework-list"><div className="assignment-table__head"><span aria-hidden="true" /><span>Задание</span><span>Предмет</span><span>Преподаватель</span><span>Срок сдачи</span><span>Статус</span><span aria-hidden="true" /></div>{visibleItems.map((item) => <div className={`assignment-row ${selected.title === item.title ? "assignment-row--selected" : ""}`} key={`${item.title}-${item.student}`} role="button" tabIndex={0} onClick={() => { setSelected(item); setExpanded(expanded === item.title ? null : item.title); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { setSelected(item); setExpanded(item.title); } }}><span className="assignment-check" /><span className="assignment-main"><strong>{item.title}</strong><small>{item.description}</small></span><span className={`subject-pill subject-pill--${item.tone}`}>{item.subject}</span><span className="assignment-student">Иван Смирнов</span><span className={`assignment-due assignment-due--${item.status === "Просрочено" ? "overdue" : ""}`}>{item.due}</span><span className={`badge assignment-status assignment-status--${item.status === "Просрочено" ? "overdue" : item.status === "На проверке" ? "review" : item.status === "Проверено" ? "success" : "pending"}`}>{item.status}</span><span className="assignment-menu-wrap assignment-mark-preview" aria-label="Метка задания">{marks[item.title] === "urgent" ? "🔥" : marks[item.title] === "hard" ? "ϟϟϟ" : marks[item.title] === "later" ? "◷" : ""}</span>{expanded === item.title ? <div className="assignment-expanded"><strong>Подробнее о задании</strong><p>{item.description || "Описание задания пока не добавлено."}</p><div><span>Предмет: <b>{item.subject}</b></span><span>Преподаватель: <b>Иван Смирнов</b></span><span>Срок: <b>{item.due}</b></span></div><button className="assignment-jump-button" type="button" onClick={(event) => { event.stopPropagation(); document.getElementById("student-selected-assignment")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>К описанию ↓</button></div> : null}</div>)}</Card><aside className="homework-sidebar"><Card className="selected-assignment" id="student-selected-assignment"><div className="selected-assignment__title"><span>Выбранное задание</span><span className="badge assignment-status--review">{selected.status}</span></div><h2>{selected.title}</h2><p>{selected.description}</p><dl><div><dt>Предмет</dt><dd>{selected.subject}</dd></div><div><dt>Преподаватель</dt><dd>Иван Смирнов</dd></div><div><dt>Срок сдачи</dt><dd>{selected.due}</dd></div></dl><p className="selected-assignment__description">Отметьте важность задания или откройте его, чтобы отправить ответ преподавателю.</p><div className="student-mark-picker">{markMenuOpen ? <div className="student-mark-options"><button type="button" className={mark === "urgent" ? "student-mark student-mark--active" : "student-mark"} onClick={() => { setMarks((current) => ({ ...current, [selected.title]: mark === "urgent" ? null : "urgent" })); setMarkMenuOpen(false); }}>🔥 Срочно</button><button type="button" className={mark === "hard" ? "student-mark student-mark--active" : "student-mark"} onClick={() => { setMarks((current) => ({ ...current, [selected.title]: mark === "hard" ? null : "hard" })); setMarkMenuOpen(false); }}>ϟϟϟ Сложно</button><button type="button" className={mark === "later" ? "student-mark student-mark--active" : "student-mark"} onClick={() => { setMarks((current) => ({ ...current, [selected.title]: mark === "later" ? null : "later" })); setMarkMenuOpen(false); }}>◷ На потом</button></div> : null}<button type="button" className="student-mark-trigger" onClick={() => setMarkMenuOpen((open) => !open)}>Метка {mark === "urgent" ? "🔥" : mark === "hard" ? "ϟϟϟ" : mark === "later" ? "◷" : "＋"}</button></div><div className="selected-assignment__actions"><button className="button button--primary" type="button">Ответить</button><button className="button button--ghost" type="button">Комментарий</button></div></Card><Card className="deadlines-card"><div className="section-heading section-heading--compact"><h3>Ближайшие сроки сдачи</h3><a href="#homework-list">Все задания →</a></div>{items.slice(0, 4).map((item) => <button type="button" key={`deadline-${item.title}`} onClick={() => { setSelected(item); setExpanded(item.title); }}><time>{item.due.slice(0, 6)}</time><span><strong>{item.title}</strong><small>{item.subject} · Иван Смирнов</small></span><span className={`badge assignment-status--${item.status === "На проверке" ? "review" : "pending"}`}>{item.status}</span></button>)}</Card></aside></div>
  </>;
}

function HomeworkView() {
  const [items, setItems] = useState(assignments);
  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState("Все предметы");
  const [status, setStatus] = useState("Все статусы");
  const [selected, setSelected] = useState(assignments[0]!);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Assignment | null>(null);
  const [expanded, setExpanded] = useState<string | null>(assignments[0]!.title);
  const [menu, setMenu] = useState<string | null>(null);
  const filtered = items.filter((item) => {
    const haystack = `${item.title} ${item.description} ${item.subject} ${item.student}`.toLowerCase();
    return haystack.includes(search.toLowerCase()) && (subject === "Все предметы" || item.subject === subject) && (status === "Все статусы" || item.status === status);
  });
  const subjects = ["Все предметы", ...new Set(items.map((item) => item.subject))];
  const statuses = ["Все статусы", ...new Set(items.map((item) => item.status))];
  const saveAssignment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = { title: String(data.get("title") || "Новое задание"), description: String(data.get("description") || ""), subject: String(data.get("subject") || "Математика"), student: String(data.get("student") || "Анна Петрова"), due: String(data.get("due") || "18 окт. 2026, 23:59"), status: "Назначено", tone: "green" } as const;
    setItems((current) => editing ? current.map((item) => item === editing ? { ...item, ...next, status: item.status, tone: item.tone } : item) : [next, ...current]);
    setSelected(next);
    setDialogOpen(false);
    setEditing(null);
  };
  const removeAssignment = () => {
    if (!confirmDelete) return;
    setItems((current) => current.filter((item) => item !== confirmDelete));
    if (selected === confirmDelete) setSelected(items.find((item) => item !== confirmDelete) ?? assignments[0]!);
    setConfirmDelete(null);
    setMenu(null);
  };
  return <>
    <div className="homework-heading"><PageHeader eyebrow="Домашние задания" title="Задания и проверка" description="Выдавайте, отслеживайте и проверяйте домашнюю работу учеников." /><div className="homework-summary-inline"><Card className="summary-card"><span>На проверке</span><strong>8</strong><small>работ от учеников</small></Card><Card className="summary-card"><span>Просрочено</span><strong>2</strong><small>задания</small></Card></div></div>
    <div className="homework-toolbar homework-toolbar--filters"><input className="input homework-search" value={search} onChange={(event) => { setSearch(event.target.value); }} placeholder="⌕  Поиск по заданиям, ученикам или предметам…" aria-label="Поиск по заданиям" /><div className="homework-filter-row"><select className="input homework-filter" value={subject} onChange={(event) => { setSubject(event.target.value); }}>{subjects.map((value) => <option key={value}>{value}</option>)}</select><select className="input homework-filter" value={status} onChange={(event) => { setStatus(event.target.value); }}>{statuses.map((value) => <option key={value}>{value}</option>)}</select><button className="button button--primary homework-create-button" type="button" onClick={() => { setEditing(null); setDialogOpen(true); }}><span aria-hidden="true">+</span><span>Выдать задание</span></button></div></div>
    <div className="homework-layout"><Card className="assignment-table" id="homework-list"><div className="assignment-table__head"><span aria-hidden="true" /><span>Задание</span><span>Предмет</span><span>Ученик</span><span>Срок сдачи</span><span>Статус</span><span aria-hidden="true" /></div>{filtered.map((item) => <div className={`assignment-row ${selected.title === item.title ? "assignment-row--selected" : ""}`} key={`${item.title}-${item.student}`} role="button" tabIndex={0} onClick={() => { setSelected(item); setExpanded(expanded === item.title ? null : item.title); setMenu(null); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { setSelected(item); setExpanded(item.title); setMenu(null); } }}><span className="assignment-check" /><span className="assignment-main"><strong>{item.title}</strong><small>{item.description}</small></span><span className={`subject-pill subject-pill--${item.tone}`}>{item.subject}</span><span className="assignment-student">{item.student}</span><span className={`assignment-due assignment-due--${item.status === "Просрочено" ? "overdue" : ""}`}>{item.due}</span><span className={`badge assignment-status assignment-status--${item.status === "Просрочено" ? "overdue" : item.status === "На проверке" ? "review" : item.status === "Проверено" ? "success" : "pending"}`}>{item.status}</span><span className="assignment-menu-wrap"><button className="assignment-menu" type="button" aria-label={`Действия для ${item.title}`} onClick={(event) => { event.stopPropagation(); setMenu(menu === item.title ? null : item.title); }}>⋮</button>{menu === item.title ? <span className="assignment-menu-popover"><button type="button" onClick={() => { setEditing(item); setDialogOpen(false); setMenu(null); }}>Изменить</button><button type="button" onClick={() => { setConfirmDelete(item); setMenu(null); }}>Удалить</button></span> : null}</span>{expanded === item.title ? <div className="assignment-expanded"><strong>Выбранное задание</strong><p>{item.description || "Описание задания пока не добавлено."}</p><div><span>Предмет: <b>{item.subject}</b></span><span>Ученик: <b>{item.student}</b></span><span>Срок: <b>{item.due}</b></span></div></div> : null}</div>)}</Card><aside className="homework-sidebar"><Card className="selected-assignment"><div className="selected-assignment__title"><span>Выбранное задание</span><span className="badge assignment-status--review">{selected.status}</span></div><h2>{selected.title}</h2><p>{selected.description}</p><dl><div><dt>Предмет</dt><dd>{selected.subject}</dd></div><div><dt>Ученик</dt><dd>{selected.student}</dd></div><div><dt>Срок сдачи</dt><dd>{selected.due}</dd></div></dl><p className="selected-assignment__description">Решите задания и прикрепите ответ. Ответ должен быть подробным и содержать все вычисления.</p><div className="selected-assignment__actions"><button className="button button--primary" type="button">Открыть ответ</button><button className="button button--ghost" type="button">Оставить комментарий</button></div></Card><Card className="deadlines-card"><div className="section-heading section-heading--compact"><h3>Ближайшие сроки сдачи</h3><a href="#homework-list">Все задания →</a></div>{items.slice(0, 4).map((item) => <button type="button" key={`deadline-${item.title}`} onClick={() => { setSelected(item); setExpanded(item.title); }}><time>{item.due.slice(0, 6)}</time><span><strong>{item.title}</strong><small>{item.student} · {item.subject}</small></span><span className={`badge assignment-status--${item.status === "На проверке" ? "review" : "pending"}`}>{item.status}</span></button>)}</Card></aside></div>
    <Dialog open={dialogOpen || editing !== null} title={editing ? "Изменить задание" : "Выдать задание"} description="Заполните основные данные задания." onClose={() => { setDialogOpen(false); setEditing(null); }}><form className="form-stack" onSubmit={saveAssignment}><label className="form-field"><span>Название задания</span><input className="input" name="title" required defaultValue={editing?.title} placeholder="Например, Решить задачи 5–12" /></label><label className="form-field"><span>Описание</span><textarea className="input textarea" name="description" defaultValue={editing?.description} placeholder="Страницы, номера или инструкция" /></label><div className="form-grid"><label className="form-field"><span>Предмет</span><select className="input" name="subject" defaultValue={editing?.subject ?? "Математика"}><option>Математика</option><option>История</option><option>Физика</option><option>Английский</option></select></label><label className="form-field"><span>Ученик</span><select className="input" name="student" defaultValue={editing?.student ?? "Анна Петрова"}><option>Анна Петрова</option><option>Иван Смирнов</option><option>Мария Иванова</option></select></label></div><label className="form-field"><span>Срок сдачи</span><input className="input" name="due" defaultValue={editing?.due} type={editing ? "text" : "datetime-local"} /></label><div className="dialog__actions"><button className="button button--secondary" type="button" onClick={() => { setDialogOpen(false); setEditing(null); }}>Отмена</button><button className="button button--primary" type="submit">{editing ? "Сохранить" : "Выдать задание"}</button></div></form></Dialog><Dialog open={confirmDelete !== null} title="Удалить задание?" description="Уведомление будет выслано ученику." onClose={() => { setConfirmDelete(null); }}><div className="dialog__actions"><button className="button button--secondary" type="button" onClick={() => { setConfirmDelete(null); }}>Отмена</button><button className="button button--danger" type="button" onClick={removeAssignment}>Удалить</button></div></Dialog>
  </>;
}

export function PlaceholderPage({ section }: { section: Section }) {
  const { user } = useAuth();
  if (section === "schedule") return <ScheduleView />;
  return user?.role === "STUDENT" ? <StudentHomeworkView /> : <HomeworkView />;
}
