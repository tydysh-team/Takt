import { zodResolver } from "@hookform/resolvers/zod";
import { useState, type SyntheticEvent } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";

import { ApiError, readableError } from "../api/client";
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
  const { login, verifyMfaLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [backupMode, setBackupMode] = useState(false);
  const [mfaSubmitting, setMfaSubmitting] = useState(false);
  const registered = (location.state as { registered?: boolean } | null)?.registered === true;
  const passwordChanged = (location.state as { passwordChanged?: boolean } | null)?.passwordChanged === true;
  const {
    register,
    handleSubmit,
    resetField,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  const submit = handleSubmit(async (values) => {
    setServerError(null);
    let destination: string | null = null;
    try {
      const user = await login(values);
      if ("mfa_required" in user) {
        setChallenge(user.challenge);
      } else {
        destination = user.role === "ADMIN" ? "/profile" : "/dashboard";
      }
    } catch (error) {
      setServerError(readableError(error));
    }
    resetField("password");
    if (destination) await navigate(destination, { replace: true });
  });

  const submitMfa = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!challenge || mfaSubmitting) return;
    setServerError(null);
    if (!backupMode && !/^\d{6}$/.test(mfaCode)) {
      setServerError("Введите шестизначный код из приложения.");
      return;
    }
    setMfaSubmitting(true);
    try {
      const user = await verifyMfaLogin({ challenge, code: mfaCode.trim() });
      setChallenge(null);
      setMfaCode("");
      await navigate(user.role === "ADMIN" ? "/profile" : "/dashboard", { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.code === "mfa_challenge_invalid") {
        setChallenge(null);
        setMfaCode("");
      }
      setServerError(readableError(error));
    } finally {
      setMfaSubmitting(false);
    }
  };

  return (
    <PublicShell>
      <div className="auth-card">
        <div className="auth-card__heading">
          <p className="eyebrow">С возвращением</p>
          <h2>Войти в Takt</h2>
          <p>Продолжите работу в своём учебном пространстве.</p>
        </div>
        {registered ? <Alert>Аккаунт создан. Теперь войдите в систему.</Alert> : null}
        {passwordChanged ? <Alert>Пароль изменён. Войдите заново</Alert> : null}
        {serverError ? <Alert tone="error">{serverError}</Alert> : null}
        {challenge ? <form key="mfa" className="form-stack" onSubmit={(event) => void submitMfa(event)} noValidate>
          <p>Подтвердите вход кодом из Authenticator или резервным кодом.</p>
          <Input id="login-mfa-code" label={backupMode ? "Резервный код" : "Код из приложения"}
            value={mfaCode} onChange={(event) => { setMfaCode(event.target.value); }}
            inputMode={backupMode ? "text" : "numeric"} autoComplete="one-time-code" autoFocus />
          <Button type="submit" loading={mfaSubmitting} disabled={mfaSubmitting}>Подтвердить вход</Button>
          <Button type="button" variant="ghost" onClick={() => { setBackupMode(!backupMode); setMfaCode(""); setServerError(null); }}>
            {backupMode ? "Использовать Authenticator" : "Использовать резервный код"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => { setChallenge(null); setMfaCode(""); setServerError(null); }}>
            Назад к вводу пароля
          </Button>
        </form> : <form key="password" className="form-stack" onSubmit={(event) => void submit(event)} noValidate>
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
        </form>}
        <p className="auth-card__switch">Нет аккаунта? <Link to="/register">Зарегистрироваться</Link></p>
      </div>
    </PublicShell>
  );
}
