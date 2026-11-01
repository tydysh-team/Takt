import { Link } from "react-router-dom";

import { Alert } from "../../components/ui/Feedback";
import { useMfaStatus } from "./mfa-status";

export function SecurityHub() {
  const status = useMfaStatus();

  return <div className="security-hub">
    <Link className="security-hub__item" to="/profile/security/password">
      <span className="security-hub__icon" aria-hidden="true">🔒</span>
      <span className="security-hub__copy"><strong>Смена пароля</strong><small>Обновите пароль для входа в аккаунт</small></span>
      <span className="security-hub__arrow" aria-hidden="true">→</span>
    </Link>
    <Link className="security-hub__item" to="/profile/security/2fa">
      <span className="security-hub__icon" aria-hidden="true">🛡</span>
      <span className="security-hub__copy"><strong>Двухфакторная аутентификация</strong><small>Защитите вход кодом из приложения</small>
        <span className="security-hub__status">{status.isLoading ? "Загружаем статус…" : status.isError ? "Статус недоступен" : status.data?.enabled ? "Включена" : "Не подключена"}</span>
      </span>
      <span className="security-hub__arrow" aria-hidden="true">→</span>
    </Link>
    {status.isError ? <Alert tone="error">Не удалось загрузить статус 2FA.</Alert> : null}
  </div>;
}
