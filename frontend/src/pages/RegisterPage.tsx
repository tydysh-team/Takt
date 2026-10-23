import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";

import { readableError } from "../api/client";
import { PublicShell } from "../components/PublicShell";
import { Button } from "../components/ui/Button";
import { Alert } from "../components/ui/Feedback";
import { Input, Select } from "../components/ui/FormField";
import { useAuth } from "../features/auth/auth-context";
import { registrationSchema, type RegistrationFormValues } from "../features/auth/registration-schema";
import { browserTimezone } from "../shared/timezones";

export function RegisterPage() {
  const { register: createAccount } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [timezone] = useState(browserTimezone);
  const {
    register,
    handleSubmit,
    resetField,
    formState: { errors, isSubmitting },
  } = useForm<RegistrationFormValues>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      first_name: "", last_name: "", middle_name: "",
      email: "", password: "", role: "TEACHER",
    },
  });

  const submit = handleSubmit(async (values) => {
    setServerError(null);
    let registered = false;
    try {
      await createAccount({ ...values, middle_name: values.middle_name || null, timezone });
      registered = true;
    } catch (error) {
      setServerError(readableError(error));
    }
    resetField("password");
    if (registered) {
      await navigate("/login", { replace: true, state: { registered: true } });
    }
  });

  return (
    <PublicShell>
      <div className="auth-card auth-card--wide">
        <div className="auth-card__heading">
          <p className="eyebrow">Новый аккаунт</p>
          <h2>Начать работу</h2>
          <p>Выберите роль — её нельзя изменить самостоятельно после регистрации.</p>
        </div>
        {serverError ? <Alert tone="error">{serverError}</Alert> : null}
        <form className="form-stack" onSubmit={(event) => void submit(event)} noValidate>
          <div className="form-grid">
            <Input label="Имя" autoComplete="given-name" autoFocus error={errors.first_name?.message} {...register("first_name")} />
            <Input label="Фамилия" autoComplete="family-name" error={errors.last_name?.message} {...register("last_name")} />
          </div>
          <Input label="Отчество" hint="Необязательно" autoComplete="additional-name" error={errors.middle_name?.message} {...register("middle_name")} />
          <Input label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register("email")} />
          <Select label="Роль" error={errors.role?.message} {...register("role")}>
            <option value="TEACHER">Преподаватель</option>
            <option value="STUDENT">Ученик</option>
          </Select>
          <Input
            label="Пароль"
            type="password"
            autoComplete="new-password"
            hint="От 8 до 128 символов."
            error={errors.password?.message}
            {...register("password")}
          />
          <Button type="submit" loading={isSubmitting}>Создать аккаунт</Button>
        </form>
        <p className="auth-card__switch">Уже есть аккаунт? <Link to="/login">Войти</Link></p>
      </div>
    </PublicShell>
  );
}
