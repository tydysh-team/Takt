import type { ProgressPeriod } from "../../api/types";
import { Card } from "../../components/ui/Card";
import { AttendanceBlock } from "./AttendanceBlock";
import { LessonHistoryTimeline } from "./LessonHistoryTimeline";
import { ProgressPeriodPicker } from "./ProgressPeriodPicker";
import { ProgressQueryState } from "./ProgressQueryState";
import { useLessonHistory, useProfileTimezone } from "./useProgress";

function HistoryContent({ studentId, timezone, period, onPeriodChange }: {
  studentId: string; timezone: string; period: ProgressPeriod;
  onPeriodChange: (period: ProgressPeriod) => void;
}) {
  const history = useLessonHistory(studentId, period);

  return (
    <>
      <ProgressPeriodPicker value={period} timezone={timezone} onChange={onPeriodChange} />
      <ProgressQueryState
        isLoading={history.isLoading}
        isError={history.isError}
        error={history.error}
        onRetry={() => void history.refetch()}
      >
        {history.data ? (
          <div className="progress-history">
            <AttendanceBlock data={history.data.aggregates} />
            <Card className="progress-block">
              <div className="progress-block__head">
                <div>
                  <p className="eyebrow">История</p>
                  <h2>Занятия за период</h2>
                </div>
              </div>
              <LessonHistoryTimeline history={history.data.history} timezone={timezone} />
            </Card>
          </div>
        ) : null}
      </ProgressQueryState>
    </>
  );
}

export function StudentHistoryPanel({ studentId, period, onPeriodChange }: {
  studentId: string; period: ProgressPeriod; onPeriodChange: (period: ProgressPeriod) => void;
}) {
  const timezone = useProfileTimezone();
  return <HistoryContent studentId={studentId} timezone={timezone} period={period} onPeriodChange={onPeriodChange} />;
}
