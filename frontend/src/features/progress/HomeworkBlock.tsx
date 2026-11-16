import type { ReactNode } from "react";

import type { HomeworkStatisticsDTO } from "../../api/types";
import { MetricCard } from "./MetricCard";
import { formatCount, formatPercent } from "./progress-format";

export function HomeworkBlock({
  data,
  action,
}: {
  data: HomeworkStatisticsDTO;
  action?: ReactNode;
}) {
  return (
    <section className="progress-block" aria-labelledby="progress-homework-title">
      <div className="progress-block__head">
        <div>
          <p className="eyebrow">Домашние задания</p>
          <h2 id="progress-homework-title">Выполнение</h2>
        </div>
        <strong className="progress-block__rate">{formatPercent(data.completion_rate)}</strong>
      </div>
      <div className="progress-metric-grid">
        <MetricCard label="Назначено" value={formatCount(data.assigned)} />
        <MetricCard label="Отправлено" value={formatCount(data.submitted)} />
        <MetricCard label="Принято" value={formatCount(data.reviewed)} />
        <MetricCard label="Сдано с опозданием" value={formatCount(data.late)} tone={data.late > 0 ? "danger" : "default"} />
        <MetricCard label="Возвращалось на доработку" value={formatCount(data.revision_required)} />
      </div>
      <p className="progress-block__note">
        Процент считается только по назначенным заданиям периода. При нулевом числе назначений показывается N/A.
      </p>
      {action ? <div>{action}</div> : null}
    </section>
  );
}
