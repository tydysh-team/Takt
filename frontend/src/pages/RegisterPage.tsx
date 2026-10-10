import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";

import { readableError } from "../api/client";
import { PublicShell } from "../components/PublicShell";
import { Button } from "../components/ui/Button";
import { Alert } from "../components/ui/Feedback";
import { Input, Select } from "../components/ui/FormField";
import { useAuth } from "../features/auth/auth-context";

const passwordSchema = z
  .string()
  .min(10, "Минимум 10 символов")
  .regex(/[a-z]/, "Добавьте строчную латинскую букву")
  .regex(/[A-Z]/, "Добавьте заглавную латинскую букву")
  .regex(/[0-9]/, "Добавьте цифру")
  .regex(/[^A-Za-z0-9]/, "Добавьте специальный символ");

const schema = z.object({
  first_name: z.string().trim().min(1, "Введите имя").max(100),
  last_name: z.string().trim().min(1, "Введите фамилию").max(100),
  email: z.email("Введите корректный email").trim(),
  password: passwordSchema,
  role: z.enum(["TEACHER", "STUDENT"]),
});

type FormValues = z.infer<typeof schema>;

export function RegisterPage() {
  const { register: createAccount } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    resetField,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { first_name: "", last_name: "", email: "", password: "", role: "TEACHER" },
  });

  const submit = handleSubmit(async (values) => {
    setServerError(null);
    let registered = false;
    try {
      await createAccount(values);
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
          <Input label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register("email")} />
          <Select label="Роль" error={errors.role?.message} {...register("role")}>
            <option value="TEACHER">Преподаватель</option>
            <option value="STUDENT">Ученик</option>
          </Select>
          <Input
            label="Пароль"
            type="password"
            autoComplete="new-password"
            hint="Минимум 10 символов: строчная и заглавная буквы, цифра и спецсимвол."
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
