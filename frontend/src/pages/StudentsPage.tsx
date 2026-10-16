import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { readableError } from "../api/client";
import { api, queryKeys } from "../api/queries";
import { PageHeader } from "../components/PageHeader";
import { PersonCard } from "../components/PersonCard";
import { Button } from "../components/ui/Button";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/Feedback";
import { Input } from "../components/ui/FormField";
import { InvitationDialog } from "../features/invitations/InvitationDialog";

export function StudentsPage() {
  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const students = useQuery({ queryKey: queryKeys.students, queryFn: api.students });
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("ru");
    if (!term) return students.data ?? [];
    return (students.data ?? []).filter((student) =>
      `${student.first_name} ${student.last_name} ${student.email}`.toLocaleLowerCase("ru").includes(term),
    );
  }, [search, students.data]);

  return (
    <>
      <PageHeader
        eyebrow="Рабочее пространство"
        title="Ученики"
        description="Все активные подключения к вашему преподавательскому аккаунту."
        action={<Button onClick={() => { setInviteOpen(true); }}>Пригласить ученика</Button>}
      />
      {students.isLoading ? <LoadingState label="Загружаем учеников…" /> : null}
      {students.isError ? <ErrorState message={readableError(students.error)} onRetry={() => void students.refetch()} /> : null}
      {students.data?.length ? (
        <>
          <div className="list-toolbar">
            <Input
              label="Поиск"
              type="search"
              value={search}
              onChange={(event) => { setSearch(event.target.value); }}
              placeholder="Имя, фамилия или email"
            />
            <span>{filtered.length} из {students.data.length}</span>
          </div>
          {filtered.length ? (
            <div className="person-list">{filtered.map((student) => <PersonCard key={student.id} person={student} basePath="/students" status={student.status} />)}</div>
          ) : (
            <EmptyState title="Ничего не найдено" description="Попробуйте изменить поисковый запрос." />
          )}
        </>
      ) : null}
      {students.data?.length === 0 ? (
        <EmptyState
          title="Пока нет учеников"
          description="Создайте приглашение и отправьте одноразовый код ученику."
          action={<Button onClick={() => { setInviteOpen(true); }}>Пригласить ученика</Button>}
        />
      ) : null}
      {inviteOpen ? <InvitationDialog open onClose={() => { setInviteOpen(false); }} /> : null}
    </>
  );
}
