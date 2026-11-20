import { Link } from "react-router-dom";

import { PageHeader } from "../../components/PageHeader";
import { ProgressPeriodPicker } from "./ProgressPeriodPicker";
import { ProgressQueryState } from "./ProgressQueryState";
import { ProgressReport } from "./ProgressReport";
import { periodSearch, useProgressPeriod } from "./period-url";
import { useMyProgress, useProfileTimezone } from "./useProgress";

function StudentProgressContent({ timezone }: { timezone: string }) {
  const { period, setPeriod } = useProgressPeriod(timezone);
  const progress = useMyProgress(period);
  const periodQuery = periodSearch(period);

  return (
    <>
      <ProgressPeriodPicker value={period} timezone={timezone} onChange={setPeriod} />
      <ProgressQueryState
        isLoading={progress.isLoading}
        isError={progress.isError}
        hasData={Boolean(progress.data)}
        error={progress.error}
        onRetry={() => void progress.refetch()}
      >
        {progress.data ? (
          <ProgressReport
            data={progress.data}
            attendanceAction={<Link className="progress-block__action" to={`/schedule?${periodQuery}`}>Моё расписание →</Link>}
            homeworkAction={<Link className="progress-block__action" to={`/homework?${periodQuery}`}>Мои задания →</Link>}
            reviewsAction={<Link className="progress-block__action" to={`/homework?${periodQuery}`}>Мои задания →</Link>}
          />
        ) : null}
      </ProgressQueryState>
    </>
  );
}

export function StudentProgressPage() {
  const timezone = useProfileTimezone();
  return (
    <div className="progress-page">
      <PageHeader
        eyebrow="Прогресс"
        title="Мой прогресс"
        description="Посещаемость, домашние задания и оценки за выбранный период."
      />
      <StudentProgressContent timezone={timezone} />
    </div>
  );
}
