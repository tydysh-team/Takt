import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";

import { readableError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Feedback";
import { Input } from "../../components/ui/FormField";
import { useAuth } from "./auth-context";
import { changePasswordSchema, type ChangePasswordFormValues } from "./change-password-schema";
import { changePasswordAndSignOut } from "./password-change-flow";

export function ChangePasswordForm() {
  const navigate = useNavigate();
  const { endSession } = useAuth();
  const [showPasswords, setShowPasswords] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { current_password: "", new_password: "", confirm_password: "" },
  });

  const submit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await changePasswordAndSignOut(
        { current_password: values.current_password, new_password: values.new_password },
        reset,
        endSession,
        () => navigate("/login", { replace: true, state: { passwordChanged: true } }),
      );
    } catch (error) {
      setServerError(readableError(error));
    }
  });

  return (
    <form className="profile-form" onSubmit={(event) => void submit(event)} noValidate>
      <h2>Смена пароля</h2>
      <p>Новый пароль должен содержать от 8 до 128 символов.</p>
      {serverError ? <Alert tone="error">{serverError}</Alert> : null}
      <Input label="Текущий пароль" type={showPasswords ? "text" : "password"}
        autoComplete="current-password" error={errors.current_password?.message}
        {...register("current_password")} />
      <Input label="Новый пароль" type={showPasswords ? "text" : "password"}
        autoComplete="new-password" hint="От 8 до 128 символов"
        error={errors.new_password?.message} {...register("new_password")} />
      <Input label="Подтверждение нового пароля" type={showPasswords ? "text" : "password"}
        autoComplete="new-password" error={errors.confirm_password?.message}
        {...register("confirm_password")} />
      <Button type="button" variant="ghost" onClick={() => { setShowPasswords((shown) => !shown); }}>
        {showPasswords ? "Скрыть пароли" : "Показать пароли"}
      </Button>
      <div className="profile-form__actions">
        <Button type="submit" loading={isSubmitting} disabled={isSubmitting}>Сменить пароль</Button>
      </div>
    </form>
  );
}
