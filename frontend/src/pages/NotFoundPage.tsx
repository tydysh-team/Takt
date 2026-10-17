import { Link } from "react-router-dom";

import { Card } from "../components/ui/Card";

export function NotFoundPage() {
  return (
    <Card className="state-card state-card--large">
      <p className="eyebrow">Ошибка 404</p>
      <h1>Страница не найдена</h1>
      <p>Возможно, адрес изменился или в нём есть опечатка.</p>
      <Link className="button button--primary" to="/">Вернуться на главную</Link>
    </Card>
  );
}

