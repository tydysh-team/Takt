import { useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { useEffect, useState, type SyntheticEvent } from "react";
import { useNavigate } from "react-router-dom";

import { readableError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Alert, LoadingState } from "../../components/ui/Feedback";
import { Input } from "../../components/ui/FormField";
import { useAuth } from "./auth-context";
import { mfaApi, type MfaSetup } from "./mfa-api";
import { statusKey, useMfaStatus } from "./mfa-status";

type WizardStep = "idle" | "password" | "qr" | "confirm" | "codes";

export function MfaSettings() {
  const status = useMfaStatus();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { endSession } = useAuth();
  const [step, setStep] = useState<WizardStep>("idle");
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disableOpen, setDisableOpen] = useState(false);
  const [managePassword, setManagePassword] = useState("");
  const [manageCode, setManageCode] = useState("");

  useEffect(() => {
    if (!setup || step !== "qr") return;
    let active = true;
    void QRCode.toDataURL(setup.provisioning_uri, { errorCorrectionLevel: "M", margin: 2, width: 220 })
      .then((url) => { if (active) setQrUrl(url); })
      .catch(() => { if (active) setError("Не удалось создать QR-код. Используйте ручной ключ."); });
    return () => { active = false; };
  }, [setup, step]);

  const clearSensitive = () => {
    setSetup(null);
    setQrUrl(null);
    setCodes(null);
    setPassword("");
    setCode("");
    setManagePassword("");
    setManageCode("");
    setError(null);
  };

  const start = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await mfaApi.start(password);
      setPassword("");
      setSetup(next);
      setStep("qr");
    } catch (cause) {
      setError(readableError(cause));
    } finally { setBusy(false); }
  };

  const confirm = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    if (!/^\d{6}$/.test(code)) { setError("Введите шестизначный код."); return; }
    setBusy(true);
    setError(null);
    try {
      const result = await mfaApi.confirm(code);
      setCodes(result.backup_codes);
      setSetup(null);
      setQrUrl(null);
      setCode("");
      queryClient.setQueryData(statusKey, { enabled: true });
      setStep("codes");
    } catch (cause) { setError(readableError(cause)); }
    finally { setBusy(false); }
  };

  const regenerate = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await mfaApi.regenerate(managePassword, manageCode);
      setManagePassword("");
      setManageCode("");
      setCodes(result.backup_codes);
      setStep("codes");
    } catch (cause) { setError(readableError(cause)); }
    finally { setBusy(false); }
  };

  const disable = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await mfaApi.disable(managePassword, manageCode);
      setDisableOpen(false);
      clearSensitive();
      await queryClient.invalidateQueries({ queryKey: statusKey });
      endSession();
      await navigate("/login", { replace: true });
    } catch (cause) { setError(readableError(cause)); }
    finally { setBusy(false); }
  };

  const copyCodes = async () => {
    if (!codes) return;
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
    } catch {
      setError("Не удалось скопировать коды. Сохраните их вручную.");
    }
  };

  if (status.isLoading) return <LoadingState label="Загружаем статус 2FA…" />;
  if (status.isError) return <Alert tone="error">{readableError(status.error)}</Alert>;

  return <div className="mfa-settings profile-form">
    <h2>Двухфакторная аутентификация</h2>
    <p>При входе потребуется код из приложения Authenticator.</p>
    <p className="mfa-status">Статус: {status.data?.enabled ? "Включена" : "Не подключена"}</p>
    {error ? <Alert tone="error">{error}</Alert> : null}

    {step === "codes" && codes ? <div className="form-stack">
      <h3>Сохраните резервные коды</h3>
      <p>Каждый код действует один раз. После закрытия этого экрана они больше не будут показаны.</p>
      <ul className="mfa-codes">{codes.map((item) => <li key={item}><code>{item}</code></li>)}</ul>
      <Button type="button" variant="ghost" onClick={() => { void copyCodes(); }}>Скопировать все</Button>
      <Button type="button" onClick={() => {
        clearSensitive();
        setStep("idle");
        endSession();
        void navigate("/login", { replace: true });
      }}>Я сохранил коды</Button>
    </div> : null}

    {!status.data?.enabled && step === "idle" ? <Button type="button" onClick={() => { setStep("password"); }}>
      Подключить Authenticator
    </Button> : null}
    {!status.data?.enabled && step === "password" ? <form className="form-stack" onSubmit={(event) => void start(event)}>
      <Input id="mfa-setup-password" label="Текущий пароль" type="password" autoComplete="current-password" value={password} onChange={(event) => { setPassword(event.target.value); }} required />
      <Button type="submit" loading={busy} disabled={busy}>Продолжить</Button>
      <Button type="button" variant="ghost" onClick={() => { clearSensitive(); setStep("idle"); }}>Отмена</Button>
    </form> : null}
    {!status.data?.enabled && step === "qr" && setup ? <div className="form-stack">
      <h3>Добавьте Takt в Authenticator</h3>
      <p>Отсканируйте QR-код. Если сканирование недоступно, введите ключ вручную.</p>
      {qrUrl ? <img className="mfa-qr" src={qrUrl} alt="QR-код для настройки Authenticator" /> : null}
      <code className="mfa-secret">{setup.secret}</code>
      <Button type="button" onClick={() => { setStep("confirm"); }}>Продолжить</Button>
      <Button type="button" variant="ghost" onClick={() => { clearSensitive(); setStep("idle"); }}>Отмена</Button>
    </div> : null}
    {!status.data?.enabled && step === "confirm" ? <form className="form-stack" onSubmit={(event) => void confirm(event)}>
      <p>Введите шестизначный код из приложения.</p>
      <Input id="mfa-confirm-code" label="Код Authenticator" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => { setCode(event.target.value); }} required />
      <Button type="submit" loading={busy} disabled={busy}>Подключить 2FA</Button>
      <Button type="button" variant="ghost" onClick={() => { setStep("qr"); }}>Назад к QR-коду</Button>
    </form> : null}

    {status.data?.enabled && step === "idle" ? <div className="form-stack">
      <p>Для входа в аккаунт теперь нужен код Authenticator или резервный код.</p>
      <Button type="button" onClick={() => { setStep("password"); }}>Перевыпустить резервные коды</Button>
      <Button type="button" variant="ghost" onClick={() => { setError(null); setDisableOpen(true); }}>Отключить 2FA</Button>
    </div> : null}
    {status.data?.enabled && step === "password" ? <form className="form-stack" onSubmit={(event) => void regenerate(event)}>
      <p>Подтвердите личность перед перевыпуском. Старые коды станут недействительными.</p>
      <Input id="mfa-regenerate-password" label="Текущий пароль" type="password" autoComplete="current-password" value={managePassword} onChange={(event) => { setManagePassword(event.target.value); }} required />
      <Input id="mfa-regenerate-code" label="Код Authenticator или резервный код" value={manageCode} onChange={(event) => { setManageCode(event.target.value); }} required />
      <Button type="submit" loading={busy} disabled={busy}>Перевыпустить коды</Button>
      <Button type="button" variant="ghost" onClick={() => { clearSensitive(); setStep("idle"); }}>Отмена</Button>
    </form> : null}
    <Dialog open={disableOpen} title="Отключить 2FA" onClose={() => { if (!busy) { setDisableOpen(false); clearSensitive(); } }}>
      <form className="form-stack" onSubmit={(event) => void disable(event)}>
        <p>Введите текущий пароль и код Authenticator или резервный код.</p>
        <Input id="mfa-disable-password" label="Текущий пароль" type="password" autoComplete="current-password" value={managePassword} onChange={(event) => { setManagePassword(event.target.value); }} required />
        <Input id="mfa-disable-code" label="Код" value={manageCode} onChange={(event) => { setManageCode(event.target.value); }} required />
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Button type="submit" loading={busy} disabled={busy}>Отключить 2FA</Button>
      </form>
    </Dialog>
  </div>;
}
