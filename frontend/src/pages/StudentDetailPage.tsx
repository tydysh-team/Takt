import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { readableError } from "../api/client";
import { api, queryKeys } from "../api/queries";
import type { StudentDetail } from "../api/types";
import { PageHeader } from "../components/PageHeader";
import { Avatar } from "../components/ui/Avatar";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Alert, ErrorState, LoadingState } from "../components/ui/Feedback";
import { Textarea } from "../components/ui/FormField";
import { formatDate, fullName } from "../shared/format";

type DetailTab = "main" | "schedule" | "homework";

function NoteEditor({ student }: { student: StudentDetail }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState(student.connection.teacher_note ?? "");
  const [saved, setSaved] = useState(false);
  const update = useMutation({
    mutationFn: () => api.updateStudentNote(student.id, note.trim() || null),
    onSuccess: async (data) => {
      queryClient.setQueryData(queryKeys.student(student.id), data);
      await queryClient.invalidateQueries({ queryKey: queryKeys.students });
      setSaved(true);
    },
  });

  return (
    <Card className="detail-card">
      <div className="section-heading section-heading--compact"><div><p className="eyebrow">Только для вас</p><h2>Личная заметка</h2></div></div>
      <p className="muted">Ученик не видит этот текст.</p>
      {saved ? <Alert>Заметка сохранена.</Alert> : null}
      {update.error ? <Alert tone="error">{readableError(update.error)}</Alert> : null}
      <Textarea
        label="Заметка об ученике"
        value={note}
        onChange={(event) => { setNote(event.target.value); setSaved(false); }}
        maxLength={2000}
        rows={6}
        placeholder="Контекст, договорённости или ваши наблюдения…"
      />
      <Button loading={update.isPending} onClick={() => { update.mutate(); }}>Сохранить заметку</Button>
    </Card>
  );
}

export function StudentDetailPage() {
  const { id = "" } = useParams();
  const [tab, setTab] = useState<DetailTab>("main");
  const student = useQuery({ queryKey: queryKeys.student(id), queryFn: () => api.student(id), enabled: Boolean(id) });

  if (student.isLoading) return <LoadingState label="Загружаем профиль ученика…" />;
  if (student.isError) return <ErrorState message={readableError(student.error)} onRetry={() => void student.refetch()} />;
  if (!student.data) return null;

  const data = student.data;
  return (
    <>
      <Link className="back-link" to="/students">← К ученикам</Link>
      <PageHeader title={fullName(data)} description={data.email} />
      <div className="profile-hero">
        <Avatar firstName={data.first_name} lastName={data.last_name} size="large" />
        <div><strong>{fullName(data)}</strong><span>{data.email}</span></div>
        <span className="badge badge--success">Активное подключение</span>
      </div>
      <div className="tabs" role="tablist" aria-label="Разделы ученика">
        {(["main", "schedule", "homework"] as const).map((value) => (
          <button key={value} role="tab" aria-selected={tab === value} className={tab === value ? "tab--active" : ""} onClick={() => { setTab(value); }}>
            {value === "main" ? "Основное" : value === "schedule" ? "Расписание" : "Домашние задания"}
          </button>
        ))}
      </div>
      {tab === "main" ? (
        <div className="detail-grid">
          <Card className="detail-card">
            <h2>Контактная информация</h2>
            <dl className="details-list">
              <div><dt>Email</dt><dd>{data.email}</dd></div>
              <div><dt>Часовой пояс</dt><dd>{data.timezone}</dd></div>
              <div><dt>Подключён</dt><dd>{formatDate(data.connection.connected_at)}</dd></div>
              <div><dt>Статус</dt><dd>{data.connection.status === "ACTIVE" ? "Активен" : data.connection.status}</dd></div>
            </dl>
          </Card>
          <NoteEditor key={data.connection.teacher_note ?? "empty"} student={data} />
        </div>
      ) : (
        <Card className="placeholder-panel"><span className="badge">Скоро</span><h2>{tab === "schedule" ? "Расписание" : "Домашние задания"}</h2><p>Этот раздел появится на следующем этапе развития Takt.</p></Card>
      )}
    </>
  );
}
