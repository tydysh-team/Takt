import { useQuery } from "@tanstack/react-query";

import { api, queryKeys } from "../../api/queries";
import type { ProgressPeriod } from "../../api/types";
import { browserTimezone } from "../../shared/timezones";
import { isValidPeriod } from "./progress-format";

export function useProfileTimezone(): string {
  const profile = useQuery({
    queryKey: queryKeys.profile,
    queryFn: api.profile,
    staleTime: 60_000,
  });
  return profile.data?.timezone ?? browserTimezone();
}

export function useMyProgress(period: ProgressPeriod) {
  return useQuery({
    queryKey: queryKeys.progress("STUDENT", undefined, period.date_from, period.date_to),
    queryFn: () => api.myProgress(period),
    enabled: isValidPeriod(period),
  });
}

export function useStudentProgress(
  studentId: string,
  period: ProgressPeriod,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.progress("TEACHER", studentId, period.date_from, period.date_to),
    queryFn: () => api.studentProgress(studentId, period),
    enabled: enabled && Boolean(studentId) && isValidPeriod(period),
  });
}

export function useLessonHistory(studentId: string, period: ProgressPeriod, enabled = true) {
  return useQuery({
    queryKey: queryKeys.lessonHistory(studentId, period.date_from, period.date_to),
    queryFn: () => api.lessonHistory(studentId, period),
    enabled: enabled && Boolean(studentId) && isValidPeriod(period),
  });
}

export function useHomeworkStatistics(
  studentId: string,
  period: ProgressPeriod,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.homeworkStatistics(studentId, period.date_from, period.date_to),
    queryFn: () => api.homeworkStatistics(studentId, period),
    enabled: enabled && Boolean(studentId) && isValidPeriod(period),
  });
}
