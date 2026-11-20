import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

import type { ProgressPeriod } from "../../api/types";
import { isValidPeriod, monthPeriod } from "./progress-format";

export function periodFromSearch(search: URLSearchParams): ProgressPeriod | null {
  const date_from = search.get("date_from");
  const date_to = search.get("date_to");
  const period = date_from && date_to ? { date_from, date_to } : null;
  return period && isValidPeriod(period) ? period : null;
}

export function periodSearch(period: ProgressPeriod): string {
  return new URLSearchParams({ date_from: period.date_from, date_to: period.date_to }).toString();
}

export function useProgressPeriod(timezone: string) {
  const [search, setSearch] = useSearchParams();
  const explicitPeriod = periodFromSearch(search);
  const period = explicitPeriod ?? monthPeriod(timezone);
  const setPeriod = useCallback((next: ProgressPeriod) => {
    setSearch((current) => {
      const updated = new URLSearchParams(current);
      updated.set("date_from", next.date_from);
      updated.set("date_to", next.date_to);
      return updated;
    });
  }, [setSearch]);
  return { period, setPeriod, explicitPeriod };
}
