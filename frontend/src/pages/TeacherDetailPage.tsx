import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { readableError } from "../api/client";
import { api, queryKeys } from "../api/queries";
import { PageHeader } from "../components/PageHeader";
import { Avatar } from "../components/ui/Avatar";
import { Card } from "../components/ui/Card";
import { ErrorState, LoadingState } from "../components/ui/Feedback";
import { formatDate, fullName } from "../shared/format";
import { SchedulePage } from "./SchedulePage";

type DetailTab = "main" | "schedule" | "homework";

export function TeacherDetailPage() {
  const { id = "" } = useParams();
  const [tab, setTab] = useState<DetailTab>("main");
  const teacher = useQuery({ queryKey: queryKeys.teacher(id), queryFn: () => api.teacher(id), enabled: Boolean(id) });

  if (teacher.isLoading) return <LoadingState label="Загружаем профиль преподавателя…" />;
  if (teacher.isError) return <ErrorState message={readableError(teacher.error)} onRetry={() => void teacher.refetch()} />;
  if (!teacher.data) return null;
  const data = teacher.data;

  return (
    <>
      <Link className="back-link" to="/teachers">← К преподавателям</Link>
      <PageHeader title={fullName(data)} description={data.email} />
      <div className="profile-hero">
        <Avatar firstName={data.first_name} lastName={data.last_name} size="large" />
        <div><strong>{fullName(data)}</strong><span>{data.email}</span></div>
        <span className="badge badge--success">Преподаватель</span>
      </div>
      <div className="tabs" role="tablist" aria-label="Разделы преподавателя">
        {(["main", "schedule", "homework"] as const).map((value) => (
          <button key={value} role="tab" aria-selected={tab === value} className={tab === value ? "tab--active" : ""} onClick={() => { setTab(value); }}>
            {value === "main" ? "Основное" : value === "schedule" ? "Расписание" : "Домашние задания"}
          </button>
        ))}
      </div>
      {tab === "main" ? (
        <div className="teacher-profile-layout teacher-profile-layout--design">
          <Card className="teacher-profile-card teacher-profile-card--intro">
            <Avatar firstName={data.first_name} lastName={data.last_name} size="large" />
            <div>
              <p className="eyebrow">Преподаватель</p>
              <h2>{fullName(data)}</h2>
              <p>{data.bio?.trim() ? data.bio.trim() : "Преподаватель пока не добавил описание."}</p>
            </div>
            <span className="badge badge--success">Активен</span>
          </Card>
          <Card className="teacher-profile-card">
            <div className="section-heading section-heading--compact"><h2>Контактная информация</h2></div>
            <dl className="details-list">
              <div><dt>Email</dt><dd>{data.email}</dd></div>
              <div><dt>Часовой пояс</dt><dd>{data.timezone}</dd></div>
              <div><dt>Подключены с</dt><dd>{formatDate(data.connected_at)}</dd></div>
            </dl>
          </Card>
        </div>
      ) : tab === "schedule" ? (
        <SchedulePage viewedTeacher={{ id: data.id, name: fullName(data) }} />
      ) : (
        <Card className="placeholder-panel"><span className="badge">Скоро</span><h2>Домашние задания</h2><p>Этот раздел появится на следующем этапе развития Takt.</p></Card>
      )}
    </>
  );
}
