import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Temporal } from "@js-temporal/polyfill";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import { readableError } from "../../api/client";
import { api, queryKeys } from "../../api/queries";
import type { Homework, HomeworkAttachment, HomeworkSubmission } from "../../api/types";
import { PageHeader } from "../../components/PageHeader";
import { useAuth } from "../auth/auth-context";
import { Alert, EmptyState, ErrorState, LoadingState } from "../../components/ui/Feedback";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Dialog } from "../../components/ui/Dialog";
import { Input, Select, Textarea } from "../../components/ui/FormField";
import { formSchema, submissionSchema, reviewSchema, revisionSchema, type FormValues, type SubmissionValues, type ReviewValues, type RevisionValues } from "./homework-schema";

const allowedExtensions = [".pdf", ".docx", ".txt", ".png", ".jpg", ".jpeg"];
const homeworkRefreshOptions = {
  refetchInterval: 30_000,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: true,
} as const;

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    assigned: "Назначено",
    submitted: "На проверке",
    needs_revision: "На доработке",
    reviewed: "Проверено",
  };
  return labels[status] ?? "Неизвестный статус";
}

function isPastDue(item: Homework, now: number): boolean {
  return (item.status === "assigned" || item.status === "needs_revision")
    && (item.is_overdue || Date.parse(item.due_at) < now);
}

function lateSubmissionLabel(attemptNo: number): string {
  return attemptNo === 1 ? "Сдано с опозданием" : "После исходного срока";
}

function cappedCount(value: number): string {
  return value > 99 ? "99+" : value.toString();
}

const TITLE_DISPLAY_LIMIT = 120;
const DESCRIPTION_DISPLAY_LIMIT = 600;

function truncateText(value: string, limit: number): string {
  const text = value.trim();
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text;
}

function queueCountLabel(value: number): string {
  if (value > 99) return `${cappedCount(value)} работ`;
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return `${value.toString()} работа`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${value.toString()} работы`;
  return `${value.toString()} работ`;
}

function personInitials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part.charAt(0).toLocaleUpperCase("ru")).join("");
}

function statusText(item: Homework, now: number): string {
  if (item.status === "assigned" && isPastDue(item, now)) return "Просрочено";
  return statusLabel(item.status);
}

function statusTone(item: Homework, now: number): string {
  if (item.status === "assigned" && isPastDue(item, now)) return "overdue";
  if (item.status === "reviewed") return "success";
  if (item.status === "submitted") return "review";
  return "pending";
}

function listStatusModifier(item: Homework, now: number): string {
  if (item.status === "assigned" && isPastDue(item, now)) return "overdue";
  return item.status;
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
  }).format(new Date(value));
}

function listDueLabel(value: string, timezone: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: timezone,
  }).format(new Date(value)).replace(/\./g, "");
}

function AttachmentLink({ attachment, downloadFile }: { attachment: HomeworkAttachment; downloadFile: () => Promise<Blob> }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const download = async () => {
    setError(null);
    setLoading(true);
    try {
      const blob = await downloadFile();
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
    <Button className="homework-attachment__download" type="button" variant="secondary" loading={loading} onClick={() => void download()} aria-label={`Скачать ${attachment.original_name}`}>Скачать</Button>
    {error ? <Alert tone="error">{error}</Alert> : null}
  </li>;
}

function HistoryBlock({ homeworkId, role, timezone }: { homeworkId: string; role: "TEACHER" | "STUDENT"; timezone: string }) {
  const history = useQuery({
    queryKey: queryKeys.homeworkHistory(role, homeworkId),
    queryFn: () => api.homeworkHistory(homeworkId, role),
    ...homeworkRefreshOptions,
  });
  return <div className="homework-materials homework-history">
    <h3>История попыток</h3>
    {history.isLoading ? <LoadingState label="Загружаем историю…" /> : history.isError && !history.data
      ? <ErrorState message={readableError(history.error)} onRetry={() => void history.refetch()} />
      : !history.data?.length ? <p className="muted">Попыток пока нет.</p>
        : <div className="homework-history__list">{history.data.map((attempt, index) => <details key={attempt.id}>
          <summary>Попытка №{attempt.attempt_no} · {dueLabel(attempt.submitted_at, timezone)}{index === history.data.length - 1 ? " · Текущая" : ""}{attempt.is_late ? ` · ${lateSubmissionLabel(attempt.attempt_no)}` : ""}</summary>
          <p>{attempt.comment ?? "Без комментария"}</p>
          {attempt.attachments.length ? <ul className="invitation-list">{attempt.attachments.map((attachment) => <AttachmentLink key={attachment.id} attachment={attachment} downloadFile={() => role === "TEACHER" ? api.downloadSubmissionAttachment(attempt.id, attachment.id) : api.downloadStudentSubmissionAttachment(homeworkId, attempt.id, attachment.id)} />)}</ul> : <p className="muted">Файлов нет.</p>}
          {attempt.review ? <div className="homework-history__review"><p>{attempt.review.decision === "accepted" ? "Принято" : "На доработку"}{attempt.review.grade !== null ? ` · Оценка: ${attempt.review.grade.toString()}` : ""} · {dueLabel(attempt.review.reviewed_at, timezone)}</p><p>{attempt.review.comment ?? "Без комментария преподавателя"}</p></div> : <p className="muted">Ожидает проверки.</p>}
        </details>)}</div>}
  </div>;
}

function TeacherSubmissionBlock({ submission, status, timezone, onReview, onDetails }: { submission: HomeworkSubmission; status: string; timezone: string; onReview: (mode: "accepted" | "revision", submissionId: string) => void; onDetails: () => void }) {
  return <div className="homework-materials homework-submission">
    <h3>Решение ученика · попытка №{submission.attempt_no}</h3>
    <p>Отправлено: {dueLabel(submission.submitted_at, timezone)}{submission.is_late ? ` · ${lateSubmissionLabel(submission.attempt_no)}` : ""}</p>
    <p>{submission.comment ?? "Без комментария"}</p>
    {submission.attachments.length ? <ul className="invitation-list">{submission.attachments.map((attachment) => <AttachmentLink key={attachment.id} attachment={attachment} downloadFile={() => api.downloadSubmissionAttachment(submission.id, attachment.id)} />)}</ul> : <p className="muted">Файлов нет.</p>}
    {submission.review ? <div className="homework-history__review"><p>{submission.review.decision === "accepted" ? "Принято" : "На доработку"}{submission.review.grade !== null ? ` · Оценка: ${submission.review.grade.toString()}` : ""} · {dueLabel(submission.review.reviewed_at, timezone)}</p><p>{submission.review.comment ?? "Без комментария преподавателя"}</p></div> : <p className="muted">Ожидает проверки.</p>}
    {status === "submitted" ? <div className="selected-assignment__actions homework-review-actions"><Button type="button" onClick={() => { onReview("accepted", submission.id); }}>Принять работу</Button><Button type="button" variant="secondary" onClick={() => { onReview("revision", submission.id); }}>Вернуть на доработку</Button><button className="homework-details-link" type="button" onClick={onDetails}>Подробнее</button></div> : null}
  </div>;
}

function AcceptDialog({ submissionId, onClose }: { submissionId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, formState: { errors } } = useForm<ReviewValues>({
    resolver: zodResolver(reviewSchema), defaultValues: { comment: "" },
  });
  const mutation = useMutation({
    mutationFn: (values: ReviewValues) => api.acceptSubmission(submissionId, values),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["homework"] }); onClose(); },
  });
  return <Dialog open title="Принять работу" onClose={onClose}>
    <form className="form-stack homework-review-form" noValidate onSubmit={(event) => void handleSubmit((values) => { mutation.mutate(values); })(event)}>
      <Input label="Оценка от 0 до 100" type="number" min={0} max={100} step={1} error={errors.grade?.message} {...register("grade", { valueAsNumber: true })} />
      <Textarea label="Комментарий" rows={4} maxLength={10000} error={errors.comment?.message} {...register("comment")} />
      {mutation.error ? <Alert tone="error">{readableError(mutation.error)}</Alert> : null}
      <div className="dialog__actions"><Button type="button" variant="secondary" onClick={onClose}>Отмена</Button><Button type="submit" loading={mutation.isPending}>Принять работу</Button></div>
    </form>
  </Dialog>;
}

function RevisionDialog({ submissionId, onClose }: { submissionId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, formState: { errors } } = useForm<RevisionValues>({
    resolver: zodResolver(revisionSchema), defaultValues: { comment: "" },
  });
  const mutation = useMutation({
    mutationFn: (values: RevisionValues) => api.returnSubmission(submissionId, values),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["homework"] }); onClose(); },
  });
  return <Dialog open title="Вернуть на доработку" onClose={onClose}>
    <form className="form-stack homework-review-form" noValidate onSubmit={(event) => void handleSubmit((values) => { mutation.mutate(values); })(event)}>
      <Textarea label="Что нужно исправить" rows={5} maxLength={10000} error={errors.comment?.message} {...register("comment")} />
      {mutation.error ? <Alert tone="error">{readableError(mutation.error)}</Alert> : null}
      <div className="dialog__actions"><Button type="button" variant="secondary" onClick={onClose}>Отмена</Button><Button type="submit" loading={mutation.isPending}>Вернуть на доработку</Button></div>
    </form>
  </Dialog>;
}

function SubmitHomeworkDialog({ homeworkId, revision = false, onClose }: { homeworkId: string; revision?: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const { register, handleSubmit, formState: { errors } } = useForm<SubmissionValues>({
    resolver: zodResolver(submissionSchema), defaultValues: { comment: "" },
  });
  const submit = useMutation({
    mutationFn: async (values: SubmissionValues) => {
      if (fileError) throw new Error(fileError);
      if (!values.comment.trim() && files.length === 0) {
        setFormError("Добавьте комментарий или файл.");
        throw new Error("Добавьте комментарий или файл.");
      }
      const form = new FormData();
      form.set("comment", values.comment.trim());
      files.forEach((file) => { form.append("files", file); });
      return api.submitHomework(homeworkId, form, requestKey);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["homework"] });
      onClose();
    },
  });
  const selectFiles = (selected: FileList | null) => {
    const next = Array.from(selected ?? []);
    setFiles(next);
    setRequestKey(crypto.randomUUID());
    setFormError(null);
    if (next.length > 5) setFileError("Можно приложить не более пяти файлов.");
    else if (next.some((file) => file.size === 0 || file.size > 10 * 1024 * 1024)) setFileError("Размер каждого файла должен быть от 1 байта до 10 МБ.");
    else if (next.some((file) => !allowedExtensions.some((extension) => file.name.toLowerCase().endsWith(extension)))) setFileError("Допустимы PDF, DOCX, TXT, PNG и JPEG.");
    else setFileError(null);
  };
  return <Dialog open title={revision ? "Отправить исправления" : "Сдать работу"} description="Добавьте комментарий или файлы решения." onClose={onClose}>
    <form className="form-stack" onSubmit={(event) => void handleSubmit((values) => { setFormError(null); submit.mutate(values); })(event)}>
      <Textarea label="Комментарий" error={errors.comment?.message} rows={5} maxLength={10000} {...register("comment", { onChange: () => { setRequestKey(crypto.randomUUID()); setFormError(null); } })} />
      <Input id="submission-files" label="Файлы решения" hint="До 5 файлов по 10 МБ: PDF, DOCX, TXT, PNG или JPEG." type="file" multiple accept={allowedExtensions.join(",")} onChange={(event) => { selectFiles(event.target.files); }} />
      {fileError ? <Alert tone="error">{fileError}</Alert> : null}
      {formError ? <Alert tone="error">{formError}</Alert> : null}
      {submit.error && !formError ? <Alert tone="error">{readableError(submit.error)}</Alert> : null}
      <div className="dialog__actions"><Button type="button" variant="secondary" onClick={onClose}>Отмена</Button><Button type="submit" loading={submit.isPending} disabled={Boolean(fileError) || submit.isPending}>Отправить</Button></div>
    </form>
  </Dialog>;
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

function HomeworkDetailView({ homeworkId, role, timezone, now, onBack }: { homeworkId: string; role: "TEACHER" | "STUDENT"; timezone: string; now: number; onBack: () => void }) {
  const detail = useQuery({
    queryKey: queryKeys.homeworkDetail(role, homeworkId),
    queryFn: () => api.homeworkDetail(homeworkId, role),
    ...homeworkRefreshOptions,
  });
  useEffect(() => {
    const page = document.querySelector(".homework-detail-page");
    const scrollIntoView = (page as { scrollIntoView?: (options?: ScrollIntoViewOptions) => void } | null)?.scrollIntoView;
    scrollIntoView?.call(page, { behavior: "smooth", block: "start" });
  }, []);
  return <section className="homework-detail-page">
    <PageHeader eyebrow="Домашние задания" title="История сдачи задания" description="Все отправки, комментарии и решения преподавателя." />
    <Button type="button" variant="secondary" className="homework-detail-back" onClick={onBack}>← К заданиям</Button>
    {detail.isLoading ? <LoadingState label="Загружаем задание…" /> : detail.isError && !detail.data ? <ErrorState message={readableError(detail.error)} onRetry={() => void detail.refetch()} /> : detail.data ? <div className="homework-detail-layout">
      <Card className="homework-detail-task">
        <span className="homework-detail-task__label">Задание</span>
        <h2>{truncateText(detail.data.title, TITLE_DISPLAY_LIMIT)}</h2>
        <p className="homework-detail-task__meta">{role === "TEACHER" ? detail.data.student_name : detail.data.teacher_name} · срок {dueLabel(detail.data.due_at, timezone)}</p>
        <dl className="homework-detail-task__meta-list">
          <div><dt>{role === "TEACHER" ? "Ученик" : "Преподаватель"}</dt><dd>{role === "TEACHER" ? detail.data.student_name : detail.data.teacher_name}</dd></div>
          <div><dt>Срок сдачи</dt><dd>{dueLabel(detail.data.due_at, timezone)}</dd></div>
          <div><dt>Текущий статус</dt><dd><span className={`badge assignment-status assignment-status--${listStatusModifier(detail.data, now)}`}>{statusText(detail.data, now)}</span></dd></div>
        </dl>
        <div className="homework-detail-section"><h3>Описание</h3><p>{truncateText(descriptionLabel(detail.data.description), DESCRIPTION_DISPLAY_LIMIT)}</p></div>
        <div className="homework-detail-section"><h3>Материалы</h3>{detail.data.attachments.length ? <ul className="invitation-list">{detail.data.attachments.map((attachment) => <AttachmentLink key={attachment.id} attachment={attachment} downloadFile={() => api.downloadHomeworkAttachment(detail.data.id, attachment.id)} />)}</ul> : <p className="muted">Материалов нет.</p>}</div>
      </Card>
      <Card className="homework-detail-history">
        <HistoryBlock homeworkId={detail.data.id} role={role} timezone={timezone} />
      </Card>
    </div> : null}
  </section>;
}

function PendingQueue({ timezone }: { timezone: string }) {
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reviewAction, setReviewAction] = useState<{ id: string; mode: "accepted" | "revision" } | null>(null);
  const list = useQuery({ queryKey: queryKeys.pendingSubmissions(offset), queryFn: () => api.pendingSubmissions(offset), ...homeworkRefreshOptions });
  const items = [...(list.data?.items ?? [])].sort((left, right) => {
    const bySubmitted = Date.parse(right.submitted_at) - Date.parse(left.submitted_at);
    return bySubmitted !== 0 ? bySubmitted : right.id.localeCompare(left.id);
  });
  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const detail = useQuery({
    queryKey: queryKeys.pendingSubmission(selected?.id ?? ""),
    queryFn: () => api.pendingSubmission(selected?.id ?? ""),
    enabled: Boolean(selected),
    ...homeworkRefreshOptions,
  });
  const dialogs = <>
    {reviewAction?.mode === "accepted" ? <AcceptDialog submissionId={reviewAction.id} onClose={() => { setReviewAction(null); }} /> : null}
    {reviewAction?.mode === "revision" ? <RevisionDialog submissionId={reviewAction.id} onClose={() => { setReviewAction(null); }} /> : null}
  </>;
  if (list.isLoading) return <LoadingState label="Загружаем работы…" />;
  if (list.isError && !list.data) return <ErrorState message={readableError(list.error)} onRetry={() => void list.refetch()} />;
  if (!items.length) return <>
    <EmptyState title="Работ на проверку нет" description="Отправленные работы появятся здесь." />
    {dialogs}
  </>;
  const total = list.data?.total ?? items.length;
  const limit = list.data?.limit ?? 20;
  return <div className="homework-queue">
    <Card className="homework-queue__list">
      <div className="homework-queue__head">
        <div>
          <p className="eyebrow">На проверке</p>
          <h2>Очередь работ</h2>
        </div>
        <span className="homework-queue__count">{queueCountLabel(total)}</span>
      </div>
      <div className="homework-queue__columns"><span>Задание</span><span>Ученик</span><span>Отправлено</span><span>Статус</span></div>
      <div className="homework-queue__items">
        {items.map((item) => {
          const active = selected?.id === item.id;
          return <button className={`homework-queue__item${active ? " homework-queue__item--active" : ""}`} type="button" key={item.id} aria-label={`Просмотреть работу ${item.title} ученика ${item.student_name}`} aria-pressed={active} onClick={() => { setSelectedId(item.id); }}>
            <span className="homework-queue__main">
              <span className="homework-queue__avatar" aria-hidden="true">{personInitials(item.student_name)}</span>
              <span className="homework-queue__copy">
                <strong title={item.title}>{truncateText(item.title, TITLE_DISPLAY_LIMIT)}</strong>
                <small>Попытка №{item.attempt_no}</small>
              </span>
            </span>
            <span className="homework-queue__student">{item.student_name}</span>
            <span className="homework-queue__submitted">
              <time dateTime={item.submitted_at}>{listDueLabel(item.submitted_at, timezone)}</time>
              {item.is_late ? <small className="homework-queue__late">Сдано с опозданием</small> : null}
            </span>
            <span className="homework-queue__status">На проверке</span>
            <span className="homework-queue__arrow" aria-hidden="true">›</span>
          </button>;
        })}
      </div>
      {total > limit ? <div className="homework-queue__pagination">
        <Button type="button" variant="secondary" disabled={offset === 0} onClick={() => { setOffset(Math.max(0, offset - limit)); setSelectedId(null); }}>Назад</Button>
        <span>{offset + 1}–{Math.min(offset + limit, total)} из {total}</span>
        <Button type="button" variant="secondary" disabled={offset + limit >= total} onClick={() => { setOffset(offset + limit); setSelectedId(null); }}>Далее</Button>
      </div> : null}
    </Card>
    {selected ? <aside className="homework-queue__detail"><Card className="homework-queue__detail-card">
      {detail.isLoading ? <LoadingState label="Загружаем работу…" /> : detail.isError && !detail.data ? <ErrorState message={readableError(detail.error)} onRetry={() => void detail.refetch()} /> : detail.data ? <>
        <div className="homework-queue__detail-head">
          <span>Выбранная работа</span>
          <span className="homework-queue__status">{statusLabel(detail.data.homework_status)}</span>
        </div>
        <h2>{truncateText(detail.data.title, TITLE_DISPLAY_LIMIT)}</h2>
        <p className="homework-queue__detail-meta">{detail.data.student_name} · попытка №{detail.data.attempt_no}</p>
        <dl className="homework-queue__detail-meta-list">
          <div><dt>Срок сдачи</dt><dd>{dueLabel(detail.data.due_at, timezone)}</dd></div>
          <div><dt>Отправлено</dt><dd>{dueLabel(detail.data.submitted_at, timezone)}{detail.data.is_late ? ` · ${lateSubmissionLabel(detail.data.attempt_no)}` : ""}</dd></div>
        </dl>
        <div className="homework-queue__detail-section">
          <h3>Комментарий ученика</h3>
          <p>{detail.data.comment ?? "Комментария нет."}</p>
        </div>
        <div className="homework-queue__detail-section">
          <h3>Файлы решения</h3>
          {detail.data.attachments.length ? <ul className="invitation-list">{detail.data.attachments.map((attachment) => <AttachmentLink key={attachment.id} attachment={attachment} downloadFile={() => api.downloadSubmissionAttachment(detail.data.id, attachment.id)} />)}</ul> : <p className="muted">Файлов нет.</p>}
        </div>
        {detail.data.homework_status === "submitted" ? <div className="selected-assignment__actions homework-review-actions">
          <Button type="button" onClick={() => { setReviewAction({ id: detail.data.id, mode: "accepted" }); }}>Принять работу</Button>
          <Button type="button" variant="secondary" onClick={() => { setReviewAction({ id: detail.data.id, mode: "revision" }); }}>Вернуть на доработку</Button>
        </div> : <Alert tone="info">Состояние задания изменилось. Обновите очередь.</Alert>}
        <HistoryBlock homeworkId={detail.data.homework_id} role="TEACHER" timezone={timezone} />
      </> : null}
    </Card></aside> : null}
    {dialogs}
  </div>;
}

export function HomeworkPanel({ personId }: { personId?: string }) {
  const { user } = useAuth();
  const profile = useQuery({ queryKey: queryKeys.profile, queryFn: api.profile });
  const timezone = profile.data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const role = user?.role === "TEACHER" ? "TEACHER" : "STUDENT";
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clickedId, setClickedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [submitAction, setSubmitAction] = useState<{ id: string; revision: boolean } | null>(null);
  const [reviewAction, setReviewAction] = useState<{ id: string; mode: "accepted" | "revision" } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showPending, setShowPending] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const list = useQuery({
    queryKey: queryKeys.homework(role, personId, offset),
    queryFn: () => role === "TEACHER" ? api.teacherHomework(personId, offset) : api.studentHomework(personId, offset),
    enabled: !showPending,
    ...homeworkRefreshOptions,
  });
  const visibleItems = (list.data?.items ?? []).filter((item) => {
    const text = `${item.title} ${item.description ?? ""} ${role === "TEACHER" ? item.student_name : item.teacher_name}`.toLocaleLowerCase("ru");
    return text.includes(search.trim().toLocaleLowerCase("ru")) && (!statusFilter || item.status === statusFilter);
  });
  const selected = visibleItems.find((item) => item.id === selectedId) ?? visibleItems[0];
  const detail = useQuery({
    queryKey: queryKeys.homeworkDetail(role, selected?.id ?? ""),
    queryFn: () => api.homeworkDetail(selected?.id ?? "", role),
    enabled: Boolean(selected) && !showPending && !detailId,
    ...homeworkRefreshOptions,
  });
  const nextDeadline = [...(list.data?.items ?? []), ...(detail.data ? [detail.data] : [])]
    .filter((item) => (item.status === "assigned" || item.status === "needs_revision") && Date.parse(item.due_at) > now)
    .map((item) => Date.parse(item.due_at))
    .sort((left, right) => left - right)[0];
  useEffect(() => {
    if (nextDeadline === undefined) return;
    const timer = window.setTimeout(
      () => { setNow(Date.now()); },
      Math.min(2_147_483_647, Math.max(1, nextDeadline - Date.now() + 1)),
    );
    return () => { window.clearTimeout(timer); };
  }, [nextDeadline]);
  const pageItems = list.data?.items ?? [];
  const hasPageData = Boolean(list.data);
  const summaryItems = pageItems.filter((item) => role === "TEACHER"
    ? item.status === "submitted"
    : item.status === "assigned" || item.status === "needs_revision");
  const summaryOverdue = summaryItems.filter((item) => role === "TEACHER"
    ? Boolean(item.latest_submission?.is_late)
    : isPastDue(item, now)).length;
  const reviewedCount = pageItems.filter((item) => item.status === "reviewed").length;
  const totalCount = pageItems.length;
  const summaryProgress = totalCount > 0 ? Math.round((reviewedCount / totalCount) * 100) : 0;
  const summaryCard = (
    <Card className={`summary-card homework-summary-card${role === "TEACHER" ? " homework-summary-card--teacher" : ""}`}>
      <div className="homework-summary-card__top">
        <span className="homework-summary-card__label">
          {role === "TEACHER" ? "На проверке" : "Нужно сделать"}
          <small>на странице</small>
        </span>
        <span className="homework-summary-card__icon" aria-hidden="true">
          {role === "TEACHER" ? <svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" /></svg> : <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></svg>}
        </span>
      </div>
      <div className="homework-summary-card__value">
        <strong>{hasPageData ? cappedCount(summaryItems.length) : "—"}</strong>
        <span>{hasPageData ? `из ${cappedCount(totalCount)}` : "заданий"}</span>
      </div>
      <div className="homework-summary-card__bar" aria-hidden="true"><span style={{ width: `${String(hasPageData ? summaryProgress : 0)}%` }} /></div>
      <div className="homework-summary-card__foot">
        <span className="homework-summary-card__overdue">просрочено: {hasPageData ? cappedCount(summaryOverdue) : "—"}</span>
        <span>проверено: {hasPageData ? cappedCount(reviewedCount) : "—"}</span>
      </div>
    </Card>
  );
  const listControls = (
    <div className={`homework-toolbar homework-toolbar--filters${showPending ? " homework-toolbar--pending" : ""}`}>
      {!showPending ? <div className="homework-search-wrap">
        <svg className="homework-search-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.2-3.2" />
        </svg>
        <input className="input homework-search" type="search" value={search} onChange={(event) => { setSearch(event.target.value); }} placeholder="Поиск по заданиям" aria-label="Поиск по текущей странице заданий" />
      </div> : null}
      <div className="homework-filter-row">
        {!showPending ? <span className="homework-filter-wrap">
          <select className="input homework-filter" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); }} aria-label="Фильтр статуса на текущей странице">
            <option value="">Все статусы</option>
            <option value="assigned">Назначено</option>
            <option value="submitted">На проверке</option>
            <option value="needs_revision">Нужна доработка</option>
            <option value="reviewed">Проверено</option>
          </select>
          <svg className="homework-filter-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
        </span> : null}
        {role === "TEACHER" && !personId ? <Button type="button" variant="secondary" className="homework-queue-toggle" aria-pressed={showPending} onClick={() => { setShowPending((value) => !value); }}>{showPending ? "Все задания" : "Ожидают проверки"}</Button> : null}
        {role === "TEACHER" ? <Button className="homework-create-button" aria-label="Назначить ДЗ" onClick={() => { setCreateOpen(true); }}><span aria-hidden="true">+</span><span>Назначить ДЗ</span></Button> : null}
      </div>
    </div>
  );
  const scrollToDetails = () => {
    const sidebar = document.querySelector(".homework-panel .homework-sidebar");
    if (!sidebar) return;
    const scrollIntoView = (sidebar as { scrollIntoView?: (options?: ScrollIntoViewOptions) => void }).scrollIntoView;
    scrollIntoView?.call(sidebar, { behavior: "smooth", block: "start" });
  };
  const activateRow = (item: Homework) => {
    if (clickedId === item.id && selected?.id === item.id) {
      scrollToDetails();
      return;
    }
    setClickedId(item.id);
    setSelectedId(item.id);
  };
  const openDetails = (item: Homework) => {
    setDetailId(item.id);
  };
  if (detailId) {
    return <section className={`homework-panel${personId ? " homework-panel--embedded" : ""}`}>
      <HomeworkDetailView homeworkId={detailId} role={role} timezone={timezone} now={now} onBack={() => { setDetailId(null); }} />
    </section>;
  }
  return <section className={`homework-panel${personId ? " homework-panel--embedded" : ""}`}>
    {personId ? (
      <div className="section-heading homework-section-heading"><div><p className="eyebrow">Домашние задания</p><h2>{role === "TEACHER" ? "Задания ученика" : "Задания преподавателя"}</h2><p className="homework-section-heading__description">{role === "TEACHER" ? "Назначенные задания, сроки и материалы." : "Задания от преподавателей и сроки сдачи."}</p></div>{summaryCard}</div>
    ) : (
      <PageHeader eyebrow="Домашние задания" title={role === "TEACHER" ? "Задания ученикам" : "Мои домашние задания"} description={role === "TEACHER" ? "Назначенные задания, сроки и материалы." : "Список назначенных работ и сроки сдачи."} action={summaryCard} />
    )}
    {showPending ? <>
      {listControls}
      <PendingQueue timezone={timezone} />
    </> : <div className="homework-surface">
      <div className="homework-surface__head"><h2 className="homework-surface__title">{role === "TEACHER" ? "Все задания" : "Мои задания"}</h2></div>
      {listControls}
      {list.isLoading ? <LoadingState label="Загружаем задания…" /> : list.isError && !list.data ? <ErrorState message={readableError(list.error)} onRetry={() => void list.refetch()} /> : list.data?.items.length === 0 ? <EmptyState title="Заданий пока нет" description="Назначенные задания появятся здесь." /> : <>
        <div className="homework-layout">
          <Card className="assignment-table homework-list-table" id="homework-list">
            <div className="assignment-table__head homework-list-table__head"><span aria-hidden="true" /><span>Задание</span><span>{role === "TEACHER" ? "Ученик" : "Преподаватель"}</span><span>Срок сдачи</span><span>Статус</span><span aria-hidden="true" /></div>
            {visibleItems.length ? visibleItems.map((item) => <button className={`assignment-row homework-list-row${selected?.id === item.id ? " homework-list-row--selected" : ""}`} type="button" key={item.id} aria-pressed={selected?.id === item.id} onClick={() => { activateRow(item); }}>
              <span className="assignment-check" aria-hidden="true" />
              <span className="assignment-main"><strong title={item.title}>{truncateText(item.title, TITLE_DISPLAY_LIMIT)}</strong><span className="assignment-description">{truncateText(descriptionLabel(item.description), DESCRIPTION_DISPLAY_LIMIT)}</span></span>
              <span className="assignment-student">{role === "TEACHER" ? item.student_name : item.teacher_name}</span>
              <time className={`assignment-due${isPastDue(item, now) ? " assignment-due--overdue" : ""}`} dateTime={item.due_at}>{listDueLabel(item.due_at, timezone)}</time>
              <span className={`badge assignment-status assignment-status--${listStatusModifier(item, now)}`}>{statusText(item, now)}</span>
              <span className="homework-row-arrow" aria-hidden="true" title="Прокрутить к деталям задания" onClick={(event) => { event.stopPropagation(); if (selected?.id !== item.id) { setSelectedId(item.id); setClickedId(item.id); } scrollToDetails(); }}>›</span>
            </button>) : <div className="homework-no-results"><EmptyState title="Ничего не найдено" description="Измените поиск или статус на этой странице." /></div>}
            {visibleItems.length || (list.data && list.data.total > list.data.limit) ? <div className="homework-list-footer">
              {list.data && list.data.total > list.data.limit ? <div className="homework-pagination">
                <Button type="button" variant="secondary" disabled={offset === 0} onClick={() => { setOffset(Math.max(0, offset - 20)); }}>Назад</Button>
                <span>{offset + 1}–{Math.min(offset + 20, list.data.total)} из {list.data.total}</span>
                <Button type="button" variant="secondary" disabled={offset + 20 >= list.data.total} onClick={() => { setOffset(offset + 20); }}>Далее</Button>
              </div> : <span />}
              {visibleItems.length ? <button className="homework-open-button" type="button" onClick={() => { const target = selected ?? visibleItems[0]; if (target) openDetails(target); }}>Открыть задание <span aria-hidden="true">→</span></button> : null}
            </div> : null}
          </Card>
        {selected ? <aside className="homework-sidebar"><Card className="selected-assignment">
          {detail.isLoading ? <LoadingState label="Загружаем условия…" /> : detail.isError && !detail.data ? <ErrorState message={readableError(detail.error)} onRetry={() => void detail.refetch()} /> : detail.data ? <>
            <div className="selected-assignment__title"><span>Выбранное задание</span><span className={`badge assignment-status--${statusTone(detail.data, now)}`}>{statusText(detail.data, now)}</span></div>
            <h2>{truncateText(detail.data.title, TITLE_DISPLAY_LIMIT)}</h2>
            <p className="full-assignment-description">{truncateText(descriptionLabel(detail.data.description), DESCRIPTION_DISPLAY_LIMIT)}</p>
            <dl>
              <div><dt>{role === "TEACHER" ? "Ученик" : "Преподаватель"}</dt><dd>{role === "TEACHER" ? detail.data.student_name : detail.data.teacher_name}</dd></div>
              <div><dt>Срок сдачи</dt><dd>{dueLabel(detail.data.due_at, timezone)}</dd></div>
            </dl>
            <div className="homework-materials"><h3>Материалы</h3>{detail.data.attachments.length ? <ul className="invitation-list">{detail.data.attachments.map((attachment) => <AttachmentLink key={attachment.id} attachment={attachment} downloadFile={() => api.downloadHomeworkAttachment(detail.data.id, attachment.id)} />)}</ul> : <p className="muted">Материалов нет.</p>}</div>
            {role === "STUDENT" && (detail.data.status === "assigned" || detail.data.status === "needs_revision") ? <div className="selected-assignment__actions"><Button type="button" onClick={() => { setSubmitAction({ id: detail.data.id, revision: detail.data.status === "needs_revision" }); }}>{detail.data.status === "needs_revision" ? "Отправить исправления" : "Сдать работу"}</Button><button className="homework-details-link" type="button" onClick={() => { openDetails(detail.data); }}>Подробнее</button></div> : null}
            {role === "STUDENT" && detail.data.latest_submission ? <div className="homework-materials"><h3>Отправленная работа · попытка №{detail.data.latest_submission.attempt_no}</h3><p>Отправлено: {dueLabel(detail.data.latest_submission.submitted_at, timezone)}{detail.data.latest_submission.is_late ? ` · ${lateSubmissionLabel(detail.data.latest_submission.attempt_no)}` : ""}</p><p>{detail.data.latest_submission.comment ?? "Без комментария"}</p>{detail.data.latest_submission.attachments.length ? <ul className="invitation-list">{detail.data.latest_submission.attachments.map((attachment) => <li className="invitation-row homework-attachment" key={attachment.id}>{attachment.original_name} · {fileSizeLabel(attachment.size_bytes)}</li>)}</ul> : null}{detail.data.latest_submission.review ? <div className="homework-history__review"><p>{detail.data.latest_submission.review.decision === "accepted" ? `Оценка: ${detail.data.latest_submission.review.grade?.toString() ?? "—"}` : "Нужна доработка"}</p><p>{detail.data.latest_submission.review.comment ?? "Без комментария преподавателя"}</p></div> : null}</div> : null}
            {role === "TEACHER" && detail.data.latest_submission ? <TeacherSubmissionBlock submission={detail.data.latest_submission} status={detail.data.status} timezone={timezone} onReview={(mode, submissionId) => { setReviewAction({ id: submissionId, mode }); }} onDetails={() => { openDetails(detail.data); }} /> : null}
            {!((role === "STUDENT" && (detail.data.status === "assigned" || detail.data.status === "needs_revision")) || (role === "TEACHER" && detail.data.latest_submission && detail.data.status === "submitted")) ? <div className="selected-assignment__actions"><button className="homework-details-link" type="button" onClick={() => { openDetails(detail.data); }}>Подробнее</button></div> : null}
            <HistoryBlock homeworkId={detail.data.id} role={role} timezone={timezone} />
          </> : null}
        </Card></aside> : null}
        </div>
      </>}
    </div>}
    {createOpen ? <CreateHomeworkDialog studentId={personId} onClose={() => { setCreateOpen(false); }} /> : null}
    {submitAction ? <SubmitHomeworkDialog homeworkId={submitAction.id} revision={submitAction.revision} onClose={() => { setSubmitAction(null); }} /> : null}
    {reviewAction?.mode === "accepted" ? <AcceptDialog submissionId={reviewAction.id} onClose={() => { setReviewAction(null); }} /> : null}
    {reviewAction?.mode === "revision" ? <RevisionDialog submissionId={reviewAction.id} onClose={() => { setReviewAction(null); }} /> : null}
  </section>;
}
