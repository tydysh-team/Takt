import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";

import { readableError } from "../api/client";
import { api, queryKeys } from "../api/queries";
import { PageHeader } from "../components/PageHeader";
import { PersonCard } from "../components/PersonCard";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/Feedback";
import { AcceptInvitationDialog } from "../features/connections/AcceptInvitationDialog";
import { useAuth } from "../features/auth/auth-context";
import { InvitationDialog } from "../features/invitations/InvitationDialog";

export function DashboardPage() {
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const summary = useQuery({ queryKey: queryKeys.dashboard, queryFn: api.dashboard });

  if (!user) return null;

  const teacher = user.role === "TEACHER";
  const action = (
    <Button onClick={() => { setDialogOpen(true); }}>
      {teacher ? "Пригласить ученика" : "Подключиться к преподавателю"}
    </Button>
  );

  if (summary.isLoading) return <LoadingState label="Собираем вашу главную…" />;
  if (summary.isError) return <ErrorState message={readableError(summary.error)} onRetry={() => void summary.refetch()} />;
  if (!summary.data) return null;

  if (summary.data.role === "TEACHER") {
    return (
      <>
        <PageHeader
          eyebrow="Главная"
          title={`Добрый день, ${user.first_name}`}
          description="Свежая картина по вашим ученикам и приглашениям."
          action={action}
        />
        <div className="metrics-grid">
          <Card className="metric-card"><span>Ученики</span><strong>{summary.data.students_count}</strong><small>активных подключений</small></Card>
          <Card className="metric-card"><span>Новые ученики</span><strong>{summary.data.new_students_30d}</strong><small>за последние 30 дней</small></Card>
          <Card className="metric-card"><span>Приглашения</span><strong>{summary.data.active_invitations_count}</strong><small>активных кодов</small></Card>
        </div>
        <section className="content-section">
          <div className="section-heading">
            <div><p className="eyebrow">Недавно</p><h2>Последние ученики</h2></div>
            <Link to="/students">Все ученики →</Link>
          </div>
          {summary.data.recent_students.length ? (
            <div className="person-list">
              {summary.data.recent_students.map((student) => <PersonCard key={student.id} person={student} basePath="/students" status={student.status} />)}
            </div>
          ) : (
            <EmptyState title="Пока нет учеников" description="Создайте приглашение и отправьте код ученику." action={action} />
          )}
        </section>
        {dialogOpen ? <InvitationDialog open onClose={() => { setDialogOpen(false); }} /> : null}
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Главная"
        title={`Добрый день, ${user.first_name}`}
        description="Ваши преподаватели и учебные связи в одном месте."
        action={action}
      />
      <div className="metrics-grid metrics-grid--student">
        <Card className="metric-card"><span>Преподаватели</span><strong>{summary.data.teachers_count}</strong><small>активных подключений</small></Card>
        <Card className="future-card"><span className="badge">Скоро</span><h2>Учебный ритм</h2><p>Расписание и домашние задания появятся на следующих этапах.</p></Card>
      </div>
      <section className="content-section">
        <div className="section-heading">
          <div><p className="eyebrow">Недавно</p><h2>Ваши преподаватели</h2></div>
          <Link to="/teachers">Все преподаватели →</Link>
        </div>
        {summary.data.recent_teachers.length ? (
          <div className="person-list">
            {summary.data.recent_teachers.map((teacherItem) => <PersonCard key={teacherItem.id} person={teacherItem} basePath="/teachers" />)}
          </div>
        ) : (
          <EmptyState title="Пока нет преподавателей" description="Введите код приглашения от преподавателя." action={action} />
        )}
      </section>
      {dialogOpen ? <AcceptInvitationDialog open onClose={() => { setDialogOpen(false); }} /> : null}
    </>
  );
}
