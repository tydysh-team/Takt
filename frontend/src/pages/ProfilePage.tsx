import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { readableError } from "../api/client";
import { api, queryKeys } from "../api/queries";
import type { Profile } from "../api/types";
import { PageHeader } from "../components/PageHeader";
import { Avatar } from "../components/ui/Avatar";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Alert, ErrorState, LoadingState } from "../components/ui/Feedback";
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

  const submit = handleSubmit(async (values) => {
    setSaved(false);
    try {
      await update.mutateAsync(values);
    } catch {
      // TanStack Query exposes the safe mutation error in the form feedback.
    }
  });

  return (
    <form className="profile-form" onSubmit={(event) => void submit(event)} noValidate>
      <div className="profile-form__feedback">
        {saved ? <Alert>Изменения сохранены.</Alert> : null}
        {!saved && update.error ? <Alert tone="error">{readableError(update.error)}</Alert> : null}
      </div>
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
      <div>
        <Button className="profile-form__submit" type="submit" loading={update.isPending}>
          Сохранить изменения
        </Button>
      </div>
    </form>
  );
}

export function ProfilePage() {
  const [tab, setTab] = useState<ProfileTab>("main");
  const profile = useQuery({ queryKey: queryKeys.profile, queryFn: api.profile });

  if (profile.isLoading) return <LoadingState label="Загружаем профиль…" />;
  if (profile.isError) return <ErrorState message={readableError(profile.error)} onRetry={() => void profile.refetch()} />;
  if (!profile.data) return null;
  const data = profile.data;

  return (
    <>
      <PageHeader eyebrow="Настройки" title="Профиль" description="Ваши данные и настройки аккаунта." />
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
    </>
  );
}
