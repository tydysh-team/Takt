import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { readableError } from "../api/client";
import { api, queryKeys } from "../api/queries";
import { PageHeader } from "../components/PageHeader";
import { Avatar } from "../components/ui/Avatar";
import { Card } from "../components/ui/Card";
import { ErrorState, LoadingState } from "../components/ui/Feedback";
import { formatFullName, roleLabel } from "../shared/format";

export function TeacherProfilePage() {
  const { id } = useParams();
  const teacher = useQuery({ queryKey: queryKeys.teacher(id ?? ""), queryFn: () => api.teacher(id ?? ""), enabled: Boolean(id) });
  const profile = useQuery({ queryKey: queryKeys.profile, queryFn: api.profile, enabled: !id });
  const request = id ? teacher : profile;

  if (request.isLoading) return <LoadingState label="Загружаем профиль преподавателя…" />;
  if (request.isError) return <ErrorState message={readableError(request.error)} onRetry={() => void request.refetch()} />;
  if (!request.data) return null;

  const data = request.data;
  const name = formatFullName(data);
  const bio = "bio" in data ? data.bio : null;
  const role = "role" in data ? data.role : "TEACHER";

  return (
    <div className="profile-page profile-page--teacher">
      <PageHeader eyebrow="Профиль преподавателя" title={name} description="Профиль, контакты и информация о преподавателе." />
      <div className="teacher-profile-layout teacher-profile-layout--design">
        <Card className="teacher-profile-card teacher-profile-card--intro">
          <Avatar firstName={data.first_name} lastName={data.last_name} size="large" />
          <div>
            <p className="eyebrow">Преподаватель</p>
            <h2>{name}</h2>
            <p>{bio ?? "Преподаватель пока не добавил описание."}</p>
          </div>
          <span className="badge badge--success">Активен</span>
        </Card>
        <Card className="teacher-profile-card">
          <div className="section-heading section-heading--compact"><h2>Контактная информация</h2></div>
          <dl className="details-list">
            <div><dt>Email</dt><dd>{data.email}</dd></div>
            <div><dt>Роль</dt><dd>{roleLabel(role)}</dd></div>
            <div><dt>Часовой пояс</dt><dd>{data.timezone}</dd></div>
          </dl>
        </Card>
        <Card className="teacher-profile-card">
          <div className="section-heading section-heading--compact"><h2>Разделы профиля</h2></div>
          <div className="teacher-profile-links">
            <Link to="/schedule"><strong>Расписание</strong><span>Посмотреть занятия на неделю →</span></Link>
            <Link to="/homework"><strong>Домашние задания</strong><span>Открыть список заданий →</span></Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
