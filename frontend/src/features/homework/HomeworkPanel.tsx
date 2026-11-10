import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Temporal } from "@js-temporal/polyfill";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { readableError } from "../../api/client";
import { api, queryKeys } from "../../api/queries";
import type { Homework, HomeworkAttachment } from "../../api/types";
import { PageHeader } from "../../components/PageHeader";
import { useAuth } from "../auth/auth-context";
import { Alert, EmptyState, ErrorState, LoadingState } from "../../components/ui/Feedback";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Dialog } from "../../components/ui/Dialog";
import { Input, Select, Textarea } from "../../components/ui/FormField";
import { formSchema, type FormValues } from "./homework-schema";

const allowedExtensions = [".pdf", ".docx", ".txt", ".png", ".jpg", ".jpeg"];

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    assigned: "Назначено",
    submitted: "На проверке",
    needs_revision: "Нужна доработка",
    reviewed: "Проверено",
  };
  return labels[status] ?? "Неизвестный статус";
}

function statusTone(item: Homework): string {
  if (item.is_overdue) return "overdue";
  if (item.status === "reviewed") return "success";
  if (item.status === "submitted") return "review";
  return "pending";
}

function fileSizeLabel(size: number): string {
  if (size < 1024) return `${size.toString()} Б`;
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024).toString()} КБ`;
  return `${(size / (1024 * 1024)).toFixed(1).replace(".", ",")} МБ`;
}

function descriptionLabel(description: string | null): string {
  const text = description?.trim();
  if (!text) return "Описание не добавлено.";
  return text;
}

function dueLabel(value: string, timezone: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium", timeStyle: "short", timeZone: timezone,
  }).format(new Date(value)) + ` · ${timezone}`;
}

function AttachmentLink({ homework, attachment }: { homework: Homework; attachment: HomeworkAttachment }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const download = async () => {
    setError(null);
    setLoading(true);
    try {
      const blob = await api.downloadHomeworkAttachment(homework.id, attachment.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = attachment.original_name;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => { URL.revokeObjectURL(url); }, 1000);
    } catch (cause) {
      setError(readableError(cause));
    } finally {
      setLoading(false);
    }
  };
  return <li className="invitation-row homework-attachment">
    <div className="homework-attachment__info">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
        <path d="M6 2.75h8l4 4V21.25H6zM14 2.75v4h4M9 12h6M9 16h6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span><strong title={attachment.original_name}>{attachment.original_name}</strong><small>{fileSizeLabel(attachment.size_bytes)}</small></span>
    </div>
    <Button type="button" variant="secondary" loading={loading} onClick={() => void download()} aria-label={`Скачать ${attachment.original_name}`}>Скачать</Button>
    {error ? <Alert tone="error">{error}</Alert> : null}
  </li>;
}

function CreateHomeworkDialog({ studentId, onClose }: { studentId: string | undefined; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const students = useQuery({ queryKey: queryKeys.students, queryFn: api.students, enabled: !studentId });
  const profile = useQuery({ queryKey: queryKeys.profile, queryFn: api.profile });
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { student_id: studentId ?? "", title: "", description: "", due_at: "" },
  });
  const create = useMutation({
    mutationFn: async (values: FormValues) => {
      if (fileError) throw new Error(fileError);
      const form = new FormData();
      form.set("student_id", values.student_id);
      form.set("title", values.title);
      form.set("description", values.description);
      try {
        const timezone = profile.data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
        form.set("due_at", Temporal.PlainDateTime.from(values.due_at).toZonedDateTime(timezone, { disambiguation: "reject" }).toInstant().toString());
      } catch {
        throw new Error("Укажите существующее время в вашем часовом поясе.");
      }
      files.forEach((file) => { form.append("files", file); });
      return api.createHomework(form, requestKey);
    },
    onSuccess: async () => {
      setRequestKey(crypto.randomUUID());
      await queryClient.invalidateQueries({ queryKey: ["homework"] });
      onClose();
    },
  });
  const selectFiles = (selected: FileList | null) => {
    setRequestKey(crypto.randomUUID());
    const next = Array.from(selected ?? []);
    setFiles(next);
    if (next.length > 5) setFileError("Можно приложить не более пяти файлов.");
    else if (next.some((file) => file.size === 0 || file.size > 10 * 1024 * 1024)) setFileError("Размер каждого файла должен быть от 1 байта до 10 МБ.");
    else if (next.some((file) => !allowedExtensions.some((extension) => file.name.toLowerCase().endsWith(extension)))) setFileError("Допустимы PDF, DOCX, TXT, PNG и JPEG.");
    else setFileError(null);
  };
  const resetKey = () => { setRequestKey(crypto.randomUUID()); };
  const message = create.error instanceof Error && !("status" in create.error) ? create.error.message : readableError(create.error);
  return <Dialog open title="Назначить домашнее задание" description="Заполните условия и при необходимости приложите материалы." onClose={onClose}>
    <form className="form-stack" onSubmit={(event) => void handleSubmit((values) => { create.mutate(values); })(event)}>
      {studentId ? <input type="hidden" {...register("student_id")} /> : <Select label="Ученик" error={errors.student_id?.message} {...register("student_id", { onChange: resetKey })}><option value="">Выберите ученика</option>{students.data?.map((student) => <option key={student.id} value={student.id}>{student.first_name} {student.last_name}</option>)}</Select>}
      {students.isError ? <Alert tone="error">{readableError(students.error)}</Alert> : null}
      <Input label="Название" error={errors.title?.message} maxLength={200} {...register("title", { onChange: resetKey })} />
      <Textarea label="Описание" error={errors.description?.message} rows={5} maxLength={10000} {...register("description", { onChange: resetKey })} />
      <Input label={`Срок выполнения${profile.data ? ` · ${profile.data.timezone}` : ""}`} error={errors.due_at?.message} type="datetime-local" {...register("due_at", { onChange: resetKey })} />
      {profile.isError ? <Alert tone="error">Не удалось загрузить часовой пояс профиля.</Alert> : null}
      <Input id="homework-files" label="Материалы" hint="До 5 файлов по 10 МБ: PDF, DOCX, TXT, PNG или JPEG." type="file" multiple accept={allowedExtensions.join(",")} onChange={(event) => { selectFiles(event.target.files); }} />
      {fileError ? <Alert tone="error">{fileError}</Alert> : null}
      {create.error ? <Alert tone="error">{message}</Alert> : null}
      <div className="dialog__actions"><Button type="button" variant="secondary" onClick={onClose}>Отмена</Button><Button type="submit" loading={create.isPending} disabled={Boolean(fileError) || profile.isLoading || profile.isError}>Назначить</Button></div>
    </form>
  </Dialog>;
}

export function HomeworkPanel({ personId }: { personId?: string }) {
  const { user } = useAuth();
  const profile = useQuery({ queryKey: queryKeys.profile, queryFn: api.profile });
  const timezone = profile.data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const role = user?.role === "TEACHER" ? "TEACHER" : "STUDENT";
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const list = useQuery({
    queryKey: queryKeys.homework(role, personId, offset),
    queryFn: () => role === "TEACHER" ? api.teacherHomework(personId, offset) : api.studentHomework(personId, offset),
  });
  const visibleItems = (list.data?.items ?? []).filter((item) => {
    const text = `${item.title} ${item.description ?? ""} ${role === "TEACHER" ? item.student_name : item.teacher_name}`.toLocaleLowerCase("ru");
    return text.includes(search.trim().toLocaleLowerCase("ru")) && (!statusFilter || item.status === statusFilter);
  });
  const selected = visibleItems.find((item) => item.id === selectedId) ?? visibleItems[0];
  const detail = useQuery({
    queryKey: queryKeys.homeworkDetail(role, selected?.id ?? ""),
    queryFn: () => api.homeworkDetail(selected?.id ?? "", role),
    enabled: Boolean(selected),
  });
  return <section className={`homework-panel${personId ? " homework-panel--embedded" : ""}`}>
    {personId ? (
      <div className="section-heading"><div><p className="eyebrow">Домашние задания</p><h2>{role === "TEACHER" ? "Задания ученика" : "Задания преподавателя"}</h2></div></div>
    ) : (
      <PageHeader eyebrow="Домашние задания" title={role === "TEACHER" ? "Задания ученикам" : "Мои задания"} description={role === "TEACHER" ? "Назначенные задания, сроки и материалы." : "Задания от преподавателей и сроки сдачи."} />
    )}
    <div className="homework-toolbar homework-toolbar--filters">
      <input className="input homework-search" type="search" value={search} onChange={(event) => { setSearch(event.target.value); }} placeholder="Поиск по текущей странице…" aria-label="Поиск по текущей странице заданий" />
      <div className="homework-filter-row">
        <select className="input homework-filter" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); }} aria-label="Фильтр статуса на текущей странице">
          <option value="">Все статусы</option>
          <option value="assigned">Назначено</option>
          <option value="submitted">На проверке</option>
          <option value="needs_revision">Нужна доработка</option>
          <option value="reviewed">Проверено</option>
        </select>
        {role === "TEACHER" ? <Button className="homework-create-button" aria-label="Назначить ДЗ" onClick={() => { setCreateOpen(true); }}><span aria-hidden="true">+</span><span>Назначить ДЗ</span></Button> : null}
      </div>
    </div>
    {list.isLoading ? <LoadingState label="Загружаем задания…" /> : list.isError ? <ErrorState message={readableError(list.error)} onRetry={() => void list.refetch()} /> : list.data?.items.length === 0 ? <EmptyState title="Заданий пока нет" description="Назначенные задания появятся здесь." /> : <>
      <div className="homework-layout">
        <Card className="assignment-table" id="homework-list">
          <div className="assignment-table__head"><span aria-hidden="true" /><span>Задание</span><span>{role === "TEACHER" ? "Ученик" : "Преподаватель"}</span><span>Срок сдачи</span><span>Статус</span><span aria-hidden="true" /></div>
          {visibleItems.length ? visibleItems.map((item) => <button className={`assignment-row${selected?.id === item.id ? " assignment-row--selected" : ""}`} type="button" key={item.id} aria-pressed={selected?.id === item.id} onClick={() => { setSelectedId(item.id); }}>
            <span className="assignment-check" aria-hidden="true" />
            <span className="assignment-main"><strong title={item.title}>{item.title}</strong><span className="assignment-description">{descriptionLabel(item.description)}</span></span>
            <span className="assignment-student">{role === "TEACHER" ? item.student_name : item.teacher_name}</span>
            <time className={`assignment-due${item.is_overdue ? " assignment-due--overdue" : ""}`} dateTime={item.due_at}>{dueLabel(item.due_at, timezone)}</time>
            <span className={`badge assignment-status assignment-status--${statusTone(item)}`}>{statusLabel(item.status)}{item.is_overdue ? " · Просрочено" : ""}</span>
            <span className="homework-row-arrow" aria-hidden="true">›</span>
          </button>) : <div className="homework-no-results"><EmptyState title="Ничего не найдено" description="Измените поиск или статус на этой странице." /></div>}
          {list.data && list.data.total > list.data.limit ? <div className="homework-pagination">
            <Button type="button" variant="secondary" disabled={offset === 0} onClick={() => { setOffset(Math.max(0, offset - 20)); }}>Назад</Button>
            <span>{offset + 1}–{Math.min(offset + 20, list.data.total)} из {list.data.total}</span>
            <Button type="button" variant="secondary" disabled={offset + 20 >= list.data.total} onClick={() => { setOffset(offset + 20); }}>Далее</Button>
          </div> : null}
        </Card>
        {selected ? <aside className="homework-sidebar"><Card className="selected-assignment">
          {detail.isLoading ? <LoadingState label="Загружаем условия…" /> : detail.isError ? <ErrorState message={readableError(detail.error)} onRetry={() => void detail.refetch()} /> : detail.data ? <>
            <div className="selected-assignment__title"><span>Выбранное задание</span><span className={`badge assignment-status--${statusTone(detail.data)}`}>{statusLabel(detail.data.status)}{detail.data.is_overdue ? " · Просрочено" : ""}</span></div>
            <h2>{detail.data.title}</h2>
            <p className="full-assignment-description">{descriptionLabel(detail.data.description)}</p>
            <dl>
              <div><dt>{role === "TEACHER" ? "Ученик" : "Преподаватель"}</dt><dd>{role === "TEACHER" ? detail.data.student_name : detail.data.teacher_name}</dd></div>
              <div><dt>Срок сдачи</dt><dd>{dueLabel(detail.data.due_at, timezone)}</dd></div>
            </dl>
            <div className="homework-materials"><h3>Материалы</h3>{detail.data.attachments.length ? <ul className="invitation-list">{detail.data.attachments.map((attachment) => <AttachmentLink key={attachment.id} homework={detail.data} attachment={attachment} />)}</ul> : <p className="muted">Материалов нет.</p>}</div>
          </> : null}
        </Card></aside> : null}
      </div>
    </>}
    {createOpen ? <CreateHomeworkDialog studentId={personId} onClose={() => { setCreateOpen(false); }} /> : null}
  </section>;
}
