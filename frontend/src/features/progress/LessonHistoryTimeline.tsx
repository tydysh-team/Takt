import type { LessonHistoryItemDTO } from "../../api/types";
import { EmptyState } from "../../components/ui/Feedback";
import { formatLessonDateTime } from "../../shared/lesson-time";
import { attendanceLabel, statusLabel } from "./progress-format";

function timeLabel(value: string, timezone: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value));
}

export function LessonHistoryTimeline({
  history,
  timezone,
}: {
  history: LessonHistoryItemDTO[];
  timezone: string;
}) {
  if (!history.length) {
    return (
      <EmptyState
        title="Занятий за период нет"
        description="Выберите другой период, чтобы увидеть историю занятий."
      />
    );
  }

  return (
    <ol className="progress-timeline" aria-label="История занятий">
      {history.map((item) => (
        <li className="progress-timeline__item" key={item.id}>
          <div className="progress-timeline__time">
            <time dateTime={item.starts_at}>{formatLessonDateTime(item.starts_at, timezone)}</time>
            <span>до {timeLabel(item.ends_at, timezone)}</span>
          </div>
          <div className="progress-timeline__main">
            <strong>{item.title}</strong>
            <div className="progress-timeline__badges">
              <span className={`progress-badge progress-badge--status-${item.status}`}>
                {statusLabel(item.status)}
              </span>
              <span className={`progress-badge progress-badge--attendance-${item.attendance}`}>
                {attendanceLabel(item.attendance)}
              </span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
