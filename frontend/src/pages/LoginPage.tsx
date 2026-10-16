import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";

import { readableError } from "../api/client";
import { PublicShell } from "../components/PublicShell";
import { Button } from "../components/ui/Button";
import { Alert } from "../components/ui/Feedback";
import { Input } from "../components/ui/FormField";
import { useAuth } from "../features/auth/auth-context";

const schema = z.object({
  email: z.email("Введите корректный email").trim(),
  password: z.string().min(1, "Введите пароль"),
});

type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);
  const registered = (location.state as { registered?: boolean } | null)?.registered === true;
  const {
    register,
    handleSubmit,
    resetField,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  const submit = handleSubmit(async (values) => {
    setServerError(null);
    let authenticated = false;
    try {
      await login(values);
      authenticated = true;
    } catch (error) {
      setServerError(readableError(error));
    }
    resetField("password");
    if (authenticated) await navigate("/dashboard", { replace: true });
  });

  return (
    <PublicShell>
      <div className="auth-card">
        <div className="auth-card__heading">
          <p className="eyebrow">С возвращением</p>
          <h2>Войти в Takt</h2>
          <p>Продолжите работу в своём учебном пространстве.</p>
        </div>
        {registered ? <Alert>Аккаунт создан. Теперь войдите в систему.</Alert> : null}
        {serverError ? <Alert tone="error">{serverError}</Alert> : null}
        <form className="form-stack" onSubmit={(event) => void submit(event)} noValidate>
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            autoFocus
            error={errors.email?.message}
            {...register("email")}
          />
          <Input
            label="Пароль"
            type="password"
            autoComplete="current-password"
            error={errors.password?.message}
            {...register("password")}
          />
          <Button type="submit" loading={isSubmitting}>Войти</Button>
        </form>
        <p className="auth-card__switch">Нет аккаунта? <Link to="/register">Зарегистрироваться</Link></p>
      </div>
    </PublicShell>
  );
}
