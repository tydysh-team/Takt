import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { readableError } from "../../api/client";
import { api, queryKeys } from "../../api/queries";
import type { InvitationCreateResponse, InvitationListItem } from "../../api/types";
import { formatDate } from "../../shared/format";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Alert, EmptyState, ErrorState, LoadingState } from "../../components/ui/Feedback";

const statusLabels: Record<InvitationListItem["status"], string> = {
  ACTIVE: "Активно",
  USED: "Использовано",
  REVOKED: "Отозвано",
  EXPIRED: "Истекло",
};

export function InvitationDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [created, setCreated] = useState<InvitationCreateResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const invitations = useQuery({
    queryKey: queryKeys.invitations,
    queryFn: api.invitations,
    enabled: open,
  });
  const create = useMutation({
    mutationFn: api.createInvitation,
    onSuccess: async (invitation) => {
      setCreated(invitation);
      setCopied(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.invitations }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard }),
      ]);
    },
  });
  const revoke = useMutation({
    mutationFn: api.revokeInvitation,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.invitations }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard }),
      ]);
    },
  });

  const copyCode = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Пригласить ученика"
      description="Код одноразовый и действует ограниченное время."
    >
      {create.error ? <Alert tone="error">{readableError(create.error)}</Alert> : null}
      {created ? (
        <div className="invitation-code">
          <span>Код приглашения</span>
          <strong>{created.code}</strong>
          <small>Действует до {formatDate(created.expires_at)}</small>
          <Button variant="secondary" onClick={() => void copyCode()}>
            {copied ? "Скопировано" : "Скопировать код"}
          </Button>
        </div>
      ) : (
        <Button loading={create.isPending} onClick={() => { create.mutate(); }}>
          Создать код
        </Button>
      )}

      <div className="dialog-section">
        <div className="section-heading section-heading--compact">
          <div>
            <p className="eyebrow">История</p>
            <h3>Активные приглашения</h3>
          </div>
        </div>
        {invitations.isLoading ? <LoadingState label="Загружаем приглашения…" /> : null}
        {invitations.isError ? (
          <ErrorState message={readableError(invitations.error)} onRetry={() => void invitations.refetch()} />
        ) : null}
        {invitations.data?.length === 0 ? (
          <EmptyState title="Приглашений пока нет" description="Создайте первый код для ученика." />
        ) : null}
        {revoke.error ? <Alert tone="error">{readableError(revoke.error)}</Alert> : null}
        <div className="invitation-list">
          {invitations.data?.map((invitation) => (
            <article className="invitation-row" key={invitation.id}>
              <div>
                <strong>{statusLabels[invitation.status]}</strong>
                <span>Создано {formatDate(invitation.created_at)} · до {formatDate(invitation.expires_at)}</span>
              </div>
              {invitation.status === "ACTIVE" ? (
                <Button
                  variant="ghost"
                  disabled={revoke.isPending}
                  onClick={() => { revoke.mutate(invitation.id); }}
                >
                  Отозвать
                </Button>
              ) : null}
            </article>
          ))}
        </div>
      </div>
      <div className="dialog__actions">
        <Button variant="secondary" onClick={onClose}>Закрыть</Button>
      </div>
    </Dialog>
  );
}
