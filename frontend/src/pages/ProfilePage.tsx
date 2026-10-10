import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { readableError } from "../api/client";
import { api, queryKeys } from "../api/queries";
import type { Profile } from "../api/types";
import { PageHeader } from "../components/PageHeader";
import { Avatar } from "../components/ui/Avatar";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Alert, ErrorState, LoadingState } from "../components/ui/Feedback";
import { Input, Textarea } from "../components/ui/FormField";
import { useAuth } from "../features/auth/auth-context";
import { fullName, roleLabel } from "../shared/format";

const schema = z.object({
  first_name: z.string().trim().min(1, "Введите имя").max(100),
  last_name: z.string().trim().min(1, "Введите фамилию").max(100),
  bio: z.string().max(2000, "Не более 2000 символов"),
  timezone: z.string().trim().min(1, "Укажите IANA часовой пояс").max(64),
});

type FormValues = z.infer<typeof schema>;
type ProfileTab = "main" | "security" | "notifications";

function ProfileForm({ profile }: { profile: Profile }) {
  const queryClient = useQueryClient();
  const { user, updateCurrentUser } = useAuth();
  const [saved, setSaved] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      first_name: profile.first_name,
      last_name: profile.last_name,
      bio: profile.bio ?? "",
      timezone: profile.timezone,
    },
  });
  const update = useMutation({
    mutationFn: (values: FormValues) => api.updateProfile({ ...values, bio: values.bio.trim() || null }),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.profile, data);
      if (user) updateCurrentUser({ ...user, first_name: data.first_name, last_name: data.last_name });
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
      {saved ? <Alert>Изменения сохранены.</Alert> : null}
      {update.error ? <Alert tone="error">{readableError(update.error)}</Alert> : null}
      <div className="form-grid">
        <Input label="Имя" autoComplete="given-name" error={errors.first_name?.message} {...register("first_name")} />
        <Input label="Фамилия" autoComplete="family-name" error={errors.last_name?.message} {...register("last_name")} />
      </div>
      <div className="form-grid">
        <Input label="Email" value={profile.email} readOnly disabled />
        <Input label="Роль" value={roleLabel(profile.role)} readOnly disabled />
      </div>
      <Textarea label="О себе" rows={5} placeholder="Расскажите немного о себе…" error={errors.bio?.message} {...register("bio")} />
      <Input
        label="Часовой пояс"
        hint="Используйте IANA формат, например Europe/Samara."
        error={errors.timezone?.message}
        {...register("timezone")}
      />
      <div><Button type="submit" loading={update.isPending}>Сохранить изменения</Button></div>
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
        <div><strong>{fullName(data)}</strong><span>{roleLabel(data.role)}</span></div>
      </div>
      <div className="tabs" role="tablist" aria-label="Настройки профиля">
        {(["main", "security", "notifications"] as const).map((value) => (
          <button key={value} role="tab" aria-selected={tab === value} className={tab === value ? "tab--active" : ""} onClick={() => { setTab(value); }}>
            {value === "main" ? "Основное" : value === "security" ? "Безопасность" : "Уведомления"}
          </button>
        ))}
      </div>
      {tab === "main" ? (
        <Card className="profile-card"><ProfileForm key={`${data.first_name}-${data.last_name}-${data.timezone}`} profile={data} /></Card>
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
