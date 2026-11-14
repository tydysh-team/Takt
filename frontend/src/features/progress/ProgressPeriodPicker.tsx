import { useState } from "react";

import type { ProgressPeriod } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/FormField";
import {
  formatPeriodLabel,
  inputsPeriod,
  monthPeriod,
  periodInputs,
  previousMonthPeriod,
} from "./progress-format";

interface ProgressPeriodPickerProps {
  value: ProgressPeriod;
  timezone: string;
  onChange: (period: ProgressPeriod) => void;
}

export function ProgressPeriodPicker({ value, timezone, onChange }: ProgressPeriodPickerProps) {
  const [error, setError] = useState<string | null>(null);
  const { from, to } = periodInputs(value, timezone);

  const applyInputs = (nextFrom: string, nextTo: string) => {
    const next = inputsPeriod(nextFrom, nextTo, timezone);
    if (!next) {
      setError("Укажите период: дата начала не должна быть позже даты окончания.");
      return;
    }
    setError(null);
    onChange(next);
  };

  return (
    <section className="progress-period" aria-label="Период статистики">
      <div className="progress-period__fields">
        <Input
          id="progress-period-from"
          label="С"
          type="date"
          value={from}
          onChange={(event) => { applyInputs(event.target.value, to); }}
        />
        <Input
          id="progress-period-to"
          label="По"
          type="date"
          value={to}
          onChange={(event) => { applyInputs(from, event.target.value); }}
        />
      </div>
      <div className="progress-period__presets">
        <Button
          type="button"
          variant="secondary"
          onClick={() => { setError(null); onChange(monthPeriod(timezone)); }}
        >
          Текущий месяц
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => { setError(null); onChange(previousMonthPeriod(timezone)); }}
        >
          Прошлый месяц
        </Button>
      </div>
      <p className="progress-period__label" role="status">
        Период: {formatPeriodLabel(value, timezone)} · {timezone}
      </p>
      {error ? <p className="progress-period__error" role="alert">{error}</p> : null}
    </section>
  );
}
