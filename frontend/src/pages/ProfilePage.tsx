import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";

import { readableError } from "../api/client";
import { api, queryKeys } from "../api/queries";
import type { Profile } from "../api/types";
import { PageHeader } from "../components/PageHeader";
import { Avatar } from "../components/ui/Avatar";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { ErrorState, LoadingState } from "../components/ui/Feedback";
import { Input, Select, Textarea } from "../components/ui/FormField";
import { useAuth } from "../features/auth/auth-context";
import { profileSchema, type ProfileFormValues } from "../features/profile/profile-schema";
import { formatFullName, roleLabel } from "../shared/format";
import { TIMEZONE_OPTIONS } from "../shared/timezones";
type ProfileTab = "main" | "security" | "notifications";

function ProfileForm({ profile }: { profile: Profile }) {
  const timezoneOptions = TIMEZONE_OPTIONS.some((option) => option.value === profile.timezone)
    ? TIMEZONE_OPTIONS
    : [{ value: profile.timezone, label: profile.timezone }, ...TIMEZONE_OPTIONS];
  const queryClient = useQueryClient();
  const { user, updateCurrentUser } = useAuth();
  const [saved, setSaved] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      first_name: profile.first_name,
      last_name: profile.last_name,
      middle_name: profile.middle_name ?? "",
      bio: profile.bio ?? "",
      timezone: profile.timezone,
    },
  });
  const update = useMutation({
    mutationFn: (values: ProfileFormValues) => api.updateProfile({
      ...values,
      middle_name: values.middle_name || null,
      bio: values.bio.trim() || null,
    }),
    onSuccess: (data) => {
      reset({
        first_name: data.first_name,
        last_name: data.last_name,
        middle_name: data.middle_name ?? "",
        bio: data.bio ?? "",
        timezone: data.timezone,
      });
      queryClient.setQueryData(queryKeys.profile, data);
      if (user) updateCurrentUser({
        ...user, first_name: data.first_name, last_name: data.last_name,
        middle_name: data.middle_name,
      });
      setSaved(true);
    },
  });
  const feedback = update.isPending
    ? ""
    : saved
      ? "Изменения сохранены"
      : update.error
        ? readableError(update.error)
        : "";
  const hasError = update.isError && !saved;

  const submit = handleSubmit(async (values) => {
    setSaved(false);
    try {
      await update.mutateAsync(values);
    } catch {
      // TanStack Query exposes the safe mutation error in the form feedback.
    }
  });

  return (
    <form
      className="profile-form"
      onChange={() => { if (saved) setSaved(false); }}
      onSubmit={(event) => void submit(event)}
      noValidate
    >
      <div className="form-grid">
        <Input label="Имя" autoComplete="given-name" error={errors.first_name?.message} {...register("first_name")} />
        <Input label="Фамилия" autoComplete="family-name" error={errors.last_name?.message} {...register("last_name")} />
      </div>
      <Input label="Отчество" hint="Необязательно" autoComplete="additional-name" error={errors.middle_name?.message} {...register("middle_name")} />
      <div className="form-grid">
        <Input label="Email" value={profile.email} readOnly disabled />
        <Input label="Роль" value={roleLabel(profile.role)} readOnly disabled />
      </div>
      <Textarea label="О себе" rows={5} placeholder="Расскажите немного о себе…" error={errors.bio?.message} {...register("bio")} />
      <Select
        label="Часовой пояс"
        error={errors.timezone?.message}
        {...register("timezone")}
      >
        {timezoneOptions.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </Select>
      <div className="profile-form__actions">
        <Button
          className="profile-form__submit"
          type="submit"
          disabled={update.isPending}
          aria-busy={update.isPending}
        >
          <span className={`profile-form__spinner${update.isPending ? " profile-form__spinner--active" : ""}`} aria-hidden="true" />
          <span>Сохранить изменения</span>
        </Button>
        <span
          className={`profile-form__status${feedback ? " profile-form__status--visible" : ""}${hasError ? " profile-form__status--error" : ""}`}
          role={hasError ? "alert" : "status"}
        >
          <span className="profile-form__status-icon" aria-hidden="true">
            {hasError ? "!" : "✓"}
          </span>
          <span>{feedback}</span>
        </span>
      </div>
    </form>
  );
}

export function ProfilePage() {
  const [tab, setTab] = useState<ProfileTab>("main");
  const profile = useQuery({ queryKey: queryKeys.profile, queryFn: api.profile });
  const students = useQuery({ queryKey: queryKeys.students, queryFn: api.students, enabled: profile.data?.role === "TEACHER" });
  const invitations = useQuery({ queryKey: queryKeys.invitations, queryFn: api.invitations, enabled: profile.data?.role === "TEACHER" });
  const teachers = useQuery({ queryKey: queryKeys.teachers, queryFn: api.teachers, enabled: profile.data?.role === "STUDENT" });

  if (profile.isLoading) return <LoadingState label="Загружаем профиль…" />;
  if (profile.isError) return <ErrorState message={readableError(profile.error)} onRetry={() => void profile.refetch()} />;
  if (!profile.data) return null;
  const data = profile.data;

  return (
    <div className="profile-page profile-page--self">
      <PageHeader eyebrow="Настройки" title="Профиль" description="Ваши данные и настройки аккаунта." />
      <div className="profile-content-grid">
        <section className="profile-main-column">
      <div className="profile-hero">
        <Avatar firstName={data.first_name} lastName={data.last_name} size="large" />
        <div><strong>{formatFullName(data)}</strong><span>{roleLabel(data.role)}</span></div>
      </div>
      <div className="tabs" role="tablist" aria-label="Настройки профиля">
        {(["main", "security", "notifications"] as const).map((value) => (
          <button key={value} role="tab" aria-selected={tab === value} className={tab === value ? "tab--active" : ""} onClick={() => { setTab(value); }}>
            {value === "main" ? "Основное" : value === "security" ? "Безопасность" : "Уведомления"}
          </button>
        ))}
      </div>
      {tab === "main" ? (
        <Card className="profile-card"><ProfileForm profile={data} /></Card>
      ) : (
        <Card className="placeholder-panel">
          <span className="badge">Скоро</span>
          <h2>{tab === "security" ? "Безопасность аккаунта" : "Настройки уведомлений"}</h2>
          <p>{tab === "security" ? "Смена пароля, двухфакторная защита и управление сессиями появятся позже." : "Управление каналами и частотой уведомлений появится позже."}</p>
        </Card>
      )}
        </section>
        <aside className="profile-side-column">
          {data.role === "STUDENT" ? <>
            <Card className="profile-side-card"><div className="profile-side-heading"><h2>Мои преподаватели</h2><Link to="/teachers">Все преподаватели →</Link></div><div className="profile-person-list">{(teachers.data ?? []).slice(0, 4).map((person) => <Link to={`/teachers/${person.id}`} key={person.id}><Avatar firstName={person.first_name} lastName={person.last_name} size="small" /><span><strong>{formatFullName(person)}</strong><small>{person.email}</small></span><b>Преподаватель</b><i>›</i></Link>)}</div>{teachers.data?.length === 0 ? <p className="profile-side-muted">Вы пока не подключили преподавателей.</p> : null}</Card>
            <Card className="profile-side-card"><div className="profile-side-heading"><h2>Ближайшие занятия</h2><Link to="/schedule">Все занятия →</Link></div><p className="profile-side-muted">Данные о занятиях пока недоступны в API. Откройте расписание, чтобы посмотреть текущий раздел.</p><Link className="profile-side-cta" to="/schedule">Перейти к расписанию →</Link></Card>
          </> : <>
            <Card className="profile-side-card"><div className="profile-side-heading"><h2>Преподаваемые предметы</h2></div><p className="profile-side-muted">{data.bio || "Предметы пока не указаны. Добавьте их в поле «О себе» в настройках профиля."}</p></Card>
            <Card className="profile-side-card"><div className="profile-side-heading"><h2>Мои ученики</h2><Link to="/students">Все ученики →</Link></div><div className="profile-person-list">{(students.data ?? []).slice(0, 5).map((person) => <Link to={`/students/${person.id}`} key={person.id}><Avatar firstName={person.first_name} lastName={person.last_name} size="small" /><span><strong>{formatFullName(person)}</strong><small>{person.email}</small></span><b>{person.status === "ACTIVE" ? "Подключён" : "Неактивен"}</b><i>›</i></Link>)}</div>{students.data?.length === 0 ? <p className="profile-side-muted">У вас пока нет подключённых учеников.</p> : null}</Card>
            <Card className="profile-side-card"><div className="profile-side-heading"><h2>Активные приглашения</h2><Link to="/students">Все приглашения →</Link></div><div className="profile-invitation-list">{(invitations.data ?? []).filter((item) => item.status === "ACTIVE").slice(0, 3).map((item) => <div key={item.id}><span className="profile-invitation-dot" /><span><strong>Приглашение</strong><small>Создано {new Date(item.created_at).toLocaleDateString("ru-RU")}</small></span><b>Ожидает ответа</b></div>)}</div>{invitations.data?.filter((item) => item.status === "ACTIVE").length === 0 ? <p className="profile-side-muted">Активных приглашений нет.</p> : null}</Card>
          </>}
        </aside>
      </div>
    </div>
  );
}
