import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { readableError } from "../api/client";
import { api, queryKeys } from "../api/queries";
import { PageHeader } from "../components/PageHeader";
import { PersonCard } from "../components/PersonCard";
import { Button } from "../components/ui/Button";
import { Alert, EmptyState, ErrorState, LoadingState } from "../components/ui/Feedback";
import { Input } from "../components/ui/FormField";
import { AcceptInvitationDialog } from "../features/connections/AcceptInvitationDialog";

export function TeachersPage() {
  const [search, setSearch] = useState("");
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const teachers = useQuery({ queryKey: queryKeys.teachers, queryFn: api.teachers });
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("ru");
    if (!term) return teachers.data ?? [];
    return (teachers.data ?? []).filter((teacher) =>
      `${teacher.first_name} ${teacher.last_name} ${teacher.email}`.toLocaleLowerCase("ru").includes(term),
    );
  }, [search, teachers.data]);

  return (
    <>
      <PageHeader
        eyebrow="Рабочее пространство"
        title="Преподаватели"
        description="Преподаватели, к которым вы подключены."
        action={<Button onClick={() => { setAccepted(false); setAcceptOpen(true); }}>Подключиться по коду</Button>}
      />
      {accepted ? <Alert>Преподаватель успешно добавлен.</Alert> : null}
      {teachers.isLoading ? <LoadingState label="Загружаем преподавателей…" /> : null}
      {teachers.isError ? <ErrorState message={readableError(teachers.error)} onRetry={() => void teachers.refetch()} /> : null}
      {teachers.data?.length ? (
        <>
          <div className="list-toolbar">
            <Input
              label="Поиск"
              type="search"
              value={search}
              onChange={(event) => { setSearch(event.target.value); }}
              placeholder="Имя, фамилия или email"
            />
            <span>{filtered.length} из {teachers.data.length}</span>
          </div>
          {filtered.length ? (
            <div className="person-list">{filtered.map((teacher) => <PersonCard key={teacher.id} person={teacher} basePath="/teacher-profile" />)}</div>
          ) : (
            <EmptyState title="Ничего не найдено" description="Попробуйте изменить поисковый запрос." />
          )}
        </>
      ) : null}
      {teachers.data?.length === 0 ? (
        <EmptyState
          title="Пока нет преподавателей"
          description="Получите приглашение и введите одноразовый код."
          action={<Button onClick={() => { setAcceptOpen(true); }}>Подключиться по коду</Button>}
        />
      ) : null}
      {acceptOpen ? (
        <AcceptInvitationDialog
          open
          onClose={() => { setAcceptOpen(false); }}
          onAccepted={() => { setAccepted(true); }}
        />
      ) : null}
    </>
  );
}
