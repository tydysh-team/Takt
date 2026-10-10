import { Link } from "react-router-dom";

import { Card } from "../components/ui/Card";

export function ForbiddenPage() {
  return (
    <Card className="state-card state-card--large">
      <span className="state-card__icon" aria-hidden="true">⊘</span>
      <p className="eyebrow">Нет доступа</p>
      <h1>Этот раздел недоступен для вашей роли</h1>
      <p>Вернитесь на главную — там собраны доступные вам инструменты.</p>
      <Link className="button button--primary" to="/dashboard">На главную</Link>
    </Card>
  );
}
