import { useState, type SyntheticEvent } from "react";

import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/ui/Card";
import { Dialog } from "../components/ui/Dialog";
import { useAuth } from "../features/auth/auth-context";


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

const initialAssignment = ((): Assignment => {
  const first = assignments[0];
  if (!first) throw new Error("assignments must not be empty");
  return first;
})();





const ASSIGNMENT_DESCRIPTION_LIMIT = 110;

function DescriptionPreview({ description, onMore, className = "" }: { description: string; onMore: () => void; className?: string }) {
  const text = description || "Описание задания пока не добавлено.";
  const isLong = text.length > ASSIGNMENT_DESCRIPTION_LIMIT;
  return <span className={`assignment-description ${className}`.trim()}><span>{isLong ? `${text.slice(0, ASSIGNMENT_DESCRIPTION_LIMIT).trimEnd()}…` : text}</span>{isLong ? <button type="button" onClick={(event) => { event.stopPropagation(); onMore(); }}>ещё</button> : null}</span>;
}

function StudentHomeworkView() {
  const [items] = useState(assignments);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("Все статусы");
  const [selected, setSelected] = useState(initialAssignment);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, "urgent" | "hard" | "later" | null>>({});
  const [markMenuOpen, setMarkMenuOpen] = useState(false);
  const [answerOpen, setAnswerOpen] = useState(false);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const mark = marks[selected.title] ?? null;
  const visibleItems = items.filter((item) => `${item.title} ${item.description} ${item.subject}`.toLocaleLowerCase("ru").includes(search.toLocaleLowerCase("ru")) && (status === "Все статусы" || item.status === status));

  return <>
    <div className="homework-heading"><PageHeader eyebrow="Домашние задания" title="Мои задания" description="Задания от преподавателей и сроки сдачи." /><div className="homework-summary-inline"><Card className="summary-card"><span>Нужно выполнить</span><strong className="homework-count"><span>{items.filter((item) => item.status === "Назначено").length}</span><b>+</b><span className="homework-count__overdue">{items.filter((item) => item.status === "Просрочено").length}</span></strong><small>активных и просроченных заданий</small></Card><Card className="summary-card"><span>На проверке</span><strong>{items.filter((item) => item.status === "На проверке").length}</strong><small>работ преподавателя</small></Card></div></div>
    <div className="homework-toolbar homework-toolbar--filters"><input className="input homework-search" value={search} onChange={(event) => { setSearch(event.target.value); }} placeholder="⌕  Поиск по заданиям или предметам…" aria-label="Поиск по заданиям" /><div className="homework-filter-row"><select className="input homework-filter" defaultValue="Все предметы"><option>Все предметы</option><option>История</option><option>Английский</option><option>Физика</option></select><select className="input homework-filter" value={status} onChange={(event) => { setStatus(event.target.value); }}><option>Все статусы</option>{[...new Set(items.map((item) => item.status))].map((value) => <option key={value}>{value}</option>)}</select></div></div>
    <div className="homework-layout homework-layout--student"><Card className="assignment-table" id="homework-list"><div className="assignment-table__head"><span aria-hidden="true" /><span>Задание</span><span>Предмет</span><span>Преподаватель</span><span>Срок сдачи</span><span>Статус</span><span aria-hidden="true" /></div>{visibleItems.map((item) => <div className={`assignment-row ${selected.title === item.title ? "assignment-row--selected" : ""}`} key={`${item.title}-${item.student}`} role="button" tabIndex={0} onClick={() => { setSelected(item); setExpanded(expanded === item.title ? null : item.title); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { setSelected(item); setExpanded(item.title); } }}><span className="assignment-check" /><span className="assignment-main"><strong title={item.title}>{item.title}</strong><DescriptionPreview description={item.description} onMore={() => { setSelected(item); setDescriptionOpen(true); }} /></span><span className={`subject-pill subject-pill--${item.tone}`}>{item.subject}</span><span className="assignment-student">Иван Смирнов</span><span className={`assignment-due assignment-due--${item.status === "Просрочено" ? "overdue" : ""}`}>{item.due}</span><span className={`badge assignment-status assignment-status--${item.status === "Просрочено" ? "overdue" : item.status === "На проверке" ? "review" : item.status === "Проверено" ? "success" : "pending"}`}>{item.status}</span><span className="assignment-menu-wrap assignment-mark-preview" aria-label="Метка задания">{marks[item.title] === "urgent" ? "🔥" : marks[item.title] === "hard" ? "ϟϟϟ" : marks[item.title] === "later" ? "◷" : ""}</span>{expanded === item.title ? <div className="assignment-expanded"><strong>Подробнее о задании</strong><p>{item.description || "Описание задания пока не добавлено."}</p><div><span>Предмет: <b>{item.subject}</b></span><span>Преподаватель: <b>Иван Смирнов</b></span><span>Срок: <b>{item.due}</b></span></div><button className="assignment-jump-button" type="button" onClick={(event) => { event.stopPropagation(); document.getElementById("student-selected-assignment")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>К описанию ↓</button></div> : null}</div>)}</Card><aside className="homework-sidebar"><Card className="selected-assignment" id="student-selected-assignment"><div className="selected-assignment__title"><span>Выбранное задание</span><span className="badge assignment-status--review">{selected.status}</span></div><h2>{selected.title}</h2><DescriptionPreview description={selected.description} className="selected-description-preview" onMore={() => { setDescriptionOpen(true); }} /><dl><div><dt>Предмет</dt><dd>{selected.subject}</dd></div><div><dt>Преподаватель</dt><dd>Иван Смирнов</dd></div><div><dt>Срок сдачи</dt><dd>{selected.due}</dd></div></dl><div className="student-mark-picker">{markMenuOpen ? <div className="student-mark-options"><button type="button" className={mark === "urgent" ? "student-mark student-mark--active" : "student-mark"} onClick={() => { setMarks((current) => ({ ...current, [selected.title]: mark === "urgent" ? null : "urgent" })); setMarkMenuOpen(false); }}>🔥 Срочно</button><button type="button" className={mark === "hard" ? "student-mark student-mark--active" : "student-mark"} onClick={() => { setMarks((current) => ({ ...current, [selected.title]: mark === "hard" ? null : "hard" })); setMarkMenuOpen(false); }}>ϟϟϟ Сложно</button><button type="button" className={mark === "later" ? "student-mark student-mark--active" : "student-mark"} onClick={() => { setMarks((current) => ({ ...current, [selected.title]: mark === "later" ? null : "later" })); setMarkMenuOpen(false); }}>◷ На потом</button></div> : null}<button type="button" className="student-mark-trigger" onClick={() => { setMarkMenuOpen((open) => !open); }}>Метка {mark === "urgent" ? "🔥" : mark === "hard" ? "ϟϟϟ" : mark === "later" ? "◷" : "＋"}</button></div><div className="selected-assignment__actions"><button className="button button--primary" type="button" onClick={() => { setAnswerOpen(true); }}>Ответить</button><button className="button button--ghost" type="button">Комментарий</button></div></Card><Card className="deadlines-card"><div className="section-heading section-heading--compact"><h3>Ближайшие сроки сдачи</h3><a href="#homework-list">Все задания →</a></div>{items.slice(0, 4).map((item) => <button type="button" key={`deadline-${item.title}`} onClick={() => { setSelected(item); setExpanded(item.title); }}><time>{item.due.slice(0, 6)}</time><span><strong>{item.title}</strong><small>{item.subject} · Иван Смирнов</small></span><span className={`badge assignment-status--${item.status === "На проверке" ? "review" : "pending"}`}>{item.status}</span></button>)}</Card></aside></div><Dialog open={answerOpen} title="Ответить на задание" description={`Отправьте ответ преподавателю: ${selected.title}.`} onClose={() => { setAnswerOpen(false); }}><form className="form-stack" onSubmit={(event) => { event.preventDefault(); setAnswerOpen(false); }}><label className="form-field"><span>Описание ответа</span><textarea className="input textarea" name="answer" rows={6} required placeholder="Напишите решение, комментарий или пояснение…" /></label><label className="form-field"><span>Прикрепить файлы</span><input className="input" name="attachments" type="file" multiple /></label><div className="dialog__actions"><button className="button button--secondary" type="button" onClick={() => { setAnswerOpen(false); }}>Отмена</button><button className="button button--primary" type="submit">Отправить ответ</button></div></form></Dialog><Dialog open={descriptionOpen} title={selected.title} onClose={() => { setDescriptionOpen(false); }}><p className="full-assignment-description">{selected.description || "Описание задания пока не добавлено."}</p></Dialog>
  </>;
}

function HomeworkView() {
  const [items, setItems] = useState(assignments);
  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState("Все предметы");
  const [status, setStatus] = useState("Все статусы");
  const [selected, setSelected] = useState(initialAssignment);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Assignment | null>(null);
  const [expanded, setExpanded] = useState<string | null>(initialAssignment.title);
  const [menu, setMenu] = useState<string | null>(null);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const filtered = items.filter((item) => {
    const haystack = `${item.title} ${item.description} ${item.subject} ${item.student}`.toLowerCase();
    return haystack.includes(search.toLowerCase()) && (subject === "Все предметы" || item.subject === subject) && (status === "Все статусы" || item.status === status);
  });
  const subjects = ["Все предметы", ...new Set(items.map((item) => item.subject))];
  const statuses = ["Все статусы", ...new Set(items.map((item) => item.status))];
  const saveAssignment = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const text = (key: string): string => {
      const value = data.get(key);
      return typeof value === "string" ? value : "";
    };
    const next = { title: text("title") || "Новое задание", description: text("description"), subject: text("subject") || "Математика", student: text("student") || "Анна Петрова", due: text("due") || "18 окт. 2026, 23:59", status: "Назначено", tone: "green" } as const;
    setItems((current) => editing ? current.map((item) => item === editing ? { ...item, ...next, status: item.status, tone: item.tone } : item) : [next, ...current]);
    setSelected(next);
    setDialogOpen(false);
    setEditing(null);
  };
  const removeAssignment = () => {
    if (!confirmDelete) return;
    setItems((current) => current.filter((item) => item !== confirmDelete));
    if (selected === confirmDelete) setSelected(items.find((item) => item !== confirmDelete) ?? initialAssignment);
    setConfirmDelete(null);
    setMenu(null);
  };
  return <>
    <div className="homework-heading"><PageHeader eyebrow="Домашние задания" title="Задания и проверка" description="Выдавайте, отслеживайте и проверяйте домашнюю работу учеников." /><div className="homework-summary-inline"><Card className="summary-card"><span>На проверке</span><strong>8</strong><small>работ от учеников</small></Card><Card className="summary-card"><span>Просрочено</span><strong>2</strong><small>задания</small></Card></div></div>
    <div className="homework-toolbar homework-toolbar--filters"><input className="input homework-search" value={search} onChange={(event) => { setSearch(event.target.value); }} placeholder="⌕  Поиск по заданиям, ученикам или предметам…" aria-label="Поиск по заданиям" /><div className="homework-filter-row"><select className="input homework-filter" value={subject} onChange={(event) => { setSubject(event.target.value); }}>{subjects.map((value) => <option key={value}>{value}</option>)}</select><select className="input homework-filter" value={status} onChange={(event) => { setStatus(event.target.value); }}>{statuses.map((value) => <option key={value}>{value}</option>)}</select><button className="button button--primary homework-create-button" type="button" onClick={() => { setEditing(null); setDialogOpen(true); }}><span aria-hidden="true">+</span><span>Выдать задание</span></button></div></div>
    <div className="homework-layout"><Card className="assignment-table" id="homework-list"><div className="assignment-table__head"><span aria-hidden="true" /><span>Задание</span><span>Предмет</span><span>Ученик</span><span>Срок сдачи</span><span>Статус</span><span aria-hidden="true" /></div>{filtered.map((item) => <div className={`assignment-row ${selected.title === item.title ? "assignment-row--selected" : ""}`} key={`${item.title}-${item.student}`} role="button" tabIndex={0} onClick={() => { setSelected(item); setExpanded(expanded === item.title ? null : item.title); setMenu(null); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { setSelected(item); setExpanded(item.title); setMenu(null); } }}><span className="assignment-check" /><span className="assignment-main"><strong title={item.title}>{item.title}</strong><DescriptionPreview description={item.description} onMore={() => { setSelected(item); setDescriptionOpen(true); }} /></span><span className={`subject-pill subject-pill--${item.tone}`}>{item.subject}</span><span className="assignment-student">{item.student}</span><span className={`assignment-due assignment-due--${item.status === "Просрочено" ? "overdue" : ""}`}>{item.due}</span><span className={`badge assignment-status assignment-status--${item.status === "Просрочено" ? "overdue" : item.status === "На проверке" ? "review" : item.status === "Проверено" ? "success" : "pending"}`}>{item.status}</span><span className="assignment-menu-wrap"><button className="assignment-menu" type="button" aria-label={`Действия для ${item.title}`} onClick={(event) => { event.stopPropagation(); setMenu(menu === item.title ? null : item.title); }}>⋮</button>{menu === item.title ? <span className="assignment-menu-popover"><button type="button" onClick={() => { setEditing(item); setDialogOpen(false); setMenu(null); }}>Изменить</button><button type="button" onClick={() => { setConfirmDelete(item); setMenu(null); }}>Удалить</button></span> : null}</span>{expanded === item.title ? <div className="assignment-expanded"><strong>Выбранное задание</strong><p>{item.description || "Описание задания пока не добавлено."}</p><div><span>Предмет: <b>{item.subject}</b></span><span>Ученик: <b>{item.student}</b></span><span>Срок: <b>{item.due}</b></span></div></div> : null}</div>)}</Card><aside className="homework-sidebar"><Card className="selected-assignment"><div className="selected-assignment__title"><span>Выбранное задание</span><span className="badge assignment-status--review">{selected.status}</span></div><h2>{selected.title}</h2><DescriptionPreview description={selected.description} className="selected-description-preview" onMore={() => { setDescriptionOpen(true); }} /><dl><div><dt>Предмет</dt><dd>{selected.subject}</dd></div><div><dt>Ученик</dt><dd>{selected.student}</dd></div><div><dt>Срок сдачи</dt><dd>{selected.due}</dd></div></dl><div className="selected-assignment__actions"><button className="button button--primary" type="button">Открыть ответ</button><button className="button button--ghost" type="button">Оставить комментарий</button></div></Card><Card className="deadlines-card"><div className="section-heading section-heading--compact"><h3>Ближайшие сроки сдачи</h3><a href="#homework-list">Все задания →</a></div>{items.slice(0, 4).map((item) => <button type="button" key={`deadline-${item.title}`} onClick={() => { setSelected(item); setExpanded(item.title); }}><time>{item.due.slice(0, 6)}</time><span><strong>{item.title}</strong><small>{item.student} · {item.subject}</small></span><span className={`badge assignment-status--${item.status === "На проверке" ? "review" : "pending"}`}>{item.status}</span></button>)}</Card></aside></div>
    <Dialog open={dialogOpen || editing !== null} title={editing ? "Изменить задание" : "Выдать задание"} description="Заполните основные данные задания." onClose={() => { setDialogOpen(false); setEditing(null); }}><form className="form-stack" onSubmit={saveAssignment}><label className="form-field"><span>Название задания</span><input className="input" name="title" required maxLength={30} defaultValue={editing?.title} placeholder="Например, Решить задачи 5–12" /></label><label className="form-field"><span>Описание</span><textarea className="input textarea" name="description" defaultValue={editing?.description} placeholder="Страницы, номера или инструкция" /></label><div className="form-grid"><label className="form-field"><span>Предмет</span><select className="input" name="subject" defaultValue={editing?.subject ?? "Математика"}><option>Математика</option><option>История</option><option>Физика</option><option>Английский</option></select></label><label className="form-field"><span>Ученик</span><select className="input" name="student" defaultValue={editing?.student ?? "Анна Петрова"}><option>Анна Петрова</option><option>Иван Смирнов</option><option>Мария Иванова</option></select></label></div><label className="form-field"><span>Срок сдачи</span><input className="input" name="due" defaultValue={editing?.due} type={editing ? "text" : "datetime-local"} /></label><div className="dialog__actions"><button className="button button--secondary" type="button" onClick={() => { setDialogOpen(false); setEditing(null); }}>Отмена</button><button className="button button--primary" type="submit">{editing ? "Сохранить" : "Выдать задание"}</button></div></form></Dialog><Dialog open={confirmDelete !== null} title="Удалить задание?" description="Уведомление будет выслано ученику." onClose={() => { setConfirmDelete(null); }}><div className="dialog__actions"><button className="button button--secondary" type="button" onClick={() => { setConfirmDelete(null); }}>Отмена</button><button className="button button--danger" type="button" onClick={removeAssignment}>Удалить</button></div></Dialog><Dialog open={descriptionOpen} title={selected.title} onClose={() => { setDescriptionOpen(false); }}><p className="full-assignment-description">{selected.description || "Описание задания пока не добавлено."}</p></Dialog>
  </>;
}

export function PlaceholderPage() {
  const { user } = useAuth();
  return user?.role === "STUDENT" ? <StudentHomeworkView /> : <HomeworkView />;
}
