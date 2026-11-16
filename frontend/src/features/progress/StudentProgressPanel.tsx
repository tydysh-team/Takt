import { useState } from "react";

import type { ProgressPeriod } from "../../api/types";
import { HomeworkBlock } from "./HomeworkBlock";
import { ProgressPeriodPicker } from "./ProgressPeriodPicker";
import { ProgressQueryState } from "./ProgressQueryState";
import { ProgressReport } from "./ProgressReport";
import { useHomeworkStatistics, useProfileTimezone, useStudentProgress } from "./useProgress";

type TeacherProgressView = "summary" | "homework";

interface StudentProgressPanelProps {
  studentId: string;
  period: ProgressPeriod;
  onPeriodChange: (period: ProgressPeriod) => void;
  onOpenHomework?: () => void;
  onOpenHistory?: () => void;
}

function TeacherProgressContent({
  studentId,
  period,
  onPeriodChange,
  timezone,
  onOpenHomework,
  onOpenHistory,
}: {
  studentId: string;
  period: ProgressPeriod;
  onPeriodChange: (period: ProgressPeriod) => void;
  timezone: string;
  onOpenHomework: (() => void) | undefined;
  onOpenHistory: (() => void) | undefined;
}) {
  const [view, setView] = useState<TeacherProgressView>("summary");
  const summary = useStudentProgress(studentId, period, view === "summary");
  const statistics = useHomeworkStatistics(studentId, period, view === "homework");
  const active = view === "summary" ? summary : statistics;

  return (
    <>
      <div className="progress-subtabs" role="tablist" aria-label="Раздел прогресса">
        <button
          type="button"
          role="tab"
          aria-selected={view === "summary"}
          onClick={() => { setView("summary"); }}
        >
          Сводка
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "homework"}
          onClick={() => { setView("homework"); }}
        >
          Домашние задания
        </button>
      </div>
      <ProgressPeriodPicker value={period} timezone={timezone} onChange={onPeriodChange} />
      <ProgressQueryState
        isLoading={active.isLoading}
        isError={active.isError}
        error={active.error}
        onRetry={() => void active.refetch()}
      >
        {view === "summary" && summary.data ? (
          <ProgressReport
            data={summary.data}
            attendanceAction={onOpenHistory ? (
              <button type="button" className="progress-block__action" onClick={onOpenHistory}>
                История занятий →
              </button>
            ) : undefined}
            homeworkAction={onOpenHomework ? (
              <button type="button" className="progress-block__action" onClick={onOpenHomework}>
                Открыть задания →
              </button>
            ) : undefined}
            reviewsAction={onOpenHomework ? (
              <button type="button" className="progress-block__action" onClick={onOpenHomework}>
                Открыть задания →
              </button>
            ) : undefined}
          />
        ) : null}
        {view === "homework" && statistics.data ? (
          <HomeworkBlock
            data={statistics.data.statistics}
            action={onOpenHomework ? (
              <button type="button" className="progress-block__action" onClick={onOpenHomework}>
                Перейти к заданиям →
              </button>
            ) : undefined}
          />
        ) : null}
      </ProgressQueryState>
    </>
  );
}

export function StudentProgressPanel({
  studentId,
  period,
  onPeriodChange,
  onOpenHomework,
  onOpenHistory,
}: StudentProgressPanelProps) {
  const timezone = useProfileTimezone();
  return (
    <TeacherProgressContent
      key={timezone}
      studentId={studentId}
      period={period}
      onPeriodChange={onPeriodChange}
      timezone={timezone}
      onOpenHomework={onOpenHomework}
      onOpenHistory={onOpenHistory}
    />
  );
}
