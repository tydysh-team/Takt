import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { readableError } from "../../api/client";
import { api, queryKeys } from "../../api/queries";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Alert } from "../../components/ui/Feedback";
import { Input } from "../../components/ui/FormField";
import { formatInvitationCode, isValidInvitationCode } from "./invitation-code";

export function AcceptInvitationDialog({
  open,
  onClose,
  onAccepted,
}: {
  open: boolean;
  onClose: () => void;
  onAccepted?: (() => void) | undefined;
}) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const accept = useMutation({
    mutationFn: api.acceptInvitation,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.teachers }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard }),
      ]);
      setCode("");
      onClose();
      onAccepted?.();
    },
  });

  const valid = isValidInvitationCode(code);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Подключиться к преподавателю"
      description="Введите одноразовый код, который прислал преподаватель."
    >
      {accept.error ? <Alert tone="error">{readableError(accept.error)}</Alert> : null}
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) accept.mutate(code);
        }}
      >
        <Input
          label="Код приглашения"
          value={code}
          onChange={(event) => { setCode(formatInvitationCode(event.target.value)); }}
          placeholder="XXXX-XXXX-XX"
          autoComplete="off"
          autoCapitalize="characters"
          maxLength={12}
          autoFocus
          hint="Например, A7KD-9PQM-2X"
          error={code && !valid && code.replaceAll("-", "").length === 10 ? "Код содержит недопустимые символы (I, O, 0, 1)." : undefined}
        />
        <div className="dialog__actions">
          <Button type="button" variant="secondary" onClick={onClose}>Отмена</Button>
          <Button type="submit" loading={accept.isPending} disabled={!valid}>Подключиться</Button>
        </div>
      </form>
    </Dialog>
  );
}
