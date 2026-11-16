import type { ReactNode } from "react";

import type { ReviewStatisticsDTO } from "../../api/types";
import { MetricCard } from "./MetricCard";
import { formatCount, formatGrade } from "./progress-format";

export function ReviewsBlock({
  data,
  action,
}: {
  data: ReviewStatisticsDTO;
  action?: ReactNode;
}) {
  return (
    <section className="progress-block" aria-labelledby="progress-reviews-title">
      <div className="progress-block__head">
        <div>
          <p className="eyebrow">Проверка работ</p>
          <h2 id="progress-reviews-title">Оценки</h2>
        </div>
        <strong className="progress-block__rate">{formatGrade(data.average_grade)}</strong>
      </div>
      <div className="progress-metric-grid">
        <MetricCard label="Оценённых работ" value={formatCount(data.graded_homework)} />
        <MetricCard label="Средняя оценка" value={formatGrade(data.average_grade)} />
      </div>
      {action ? <div>{action}</div> : null}
    </section>
  );
}
