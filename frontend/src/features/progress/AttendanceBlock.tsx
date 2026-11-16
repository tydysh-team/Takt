import type { ReactNode } from "react";

import type { LessonHistoryAggregatesDTO } from "../../api/types";
import { MetricCard } from "./MetricCard";
import { formatCount, formatPercent } from "./progress-format";

export function AttendanceBlock({
  data,
  action,
}: {
  data: LessonHistoryAggregatesDTO;
  action?: ReactNode;
}) {
  return (
    <section className="progress-block" aria-labelledby="progress-attendance-title">
      <div className="progress-block__head">
        <div>
          <p className="eyebrow">Посещаемость</p>
          <h2 id="progress-attendance-title">Занятия</h2>
        </div>
        <strong className="progress-block__rate">{formatPercent(data.attendance_rate)}</strong>
      </div>
      <div className="progress-metric-grid">
        <MetricCard label="Всего занятий" value={formatCount(data.total_lessons)} />
        <MetricCard label="Завершено" value={formatCount(data.completed_lessons)} />
        <MetricCard label="Посещено" value={formatCount(data.attended_lessons)} />
        <MetricCard label="Пропущено" value={formatCount(data.missed_lessons)} tone={data.missed_lessons > 0 ? "danger" : "default"} />
        <MetricCard label="Не отмечено" value={formatCount(data.unmarked_lessons)} />
        <MetricCard label="Отменено" value={formatCount(data.cancelled_lessons)} />
      </div>
      {action ? <div>{action}</div> : null}
    </section>
  );
}
