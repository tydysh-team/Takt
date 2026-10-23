import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { minuteSuggestions } from "./lesson-form-validation";

const hours = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));

export function LessonTimePicker({ value, onChange, invalid, errorId }: {
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
  errorId?: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(false);
  const [activeHour, setActiveHour] = useState(0);
  const [activeMinute, setActiveMinute] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hourRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const minuteRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  const selectedHour = selected?.[1] ?? "00";
  const selectedMinute = selected?.[2] ?? "00";

  function openPanel() {
    const bounds = rootRef.current?.getBoundingClientRect();
    setAbove(Boolean(bounds && window.innerHeight - bounds.bottom < 260 && bounds.top > 260));
    setActiveHour(Number(selectedHour));
    setActiveMinute(Math.max(0, minuteSuggestions.indexOf(selectedMinute)));
    setOpen(true);
  }

  function chooseHour(hour: string) {
    onChange(`${hour}:${selectedMinute}`);
  }

  function chooseMinute(minute: string) {
    onChange(`${selectedHour}:${minute}`);
  }

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnFocusOutside = (event: FocusEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("focusin", closeOnFocusOutside);
    document.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("focusin", closeOnFocusOutside);
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [open]);

  useEffect(() => {
    if (open) hourRefs.current[activeHour]?.focus();
  }, [open, activeHour]);

  function navigate(event: ReactKeyboardEvent<HTMLButtonElement>, column: "hour" | "minute", index: number) {
    const count = column === "hour" ? hours.length : minuteSuggestions.length;
    const refs = column === "hour" ? hourRefs : minuteRefs;
    let next: number;
    if (event.key === "ArrowDown") next = (index + 1) % count;
    else if (event.key === "ArrowUp") next = (index - 1 + count) % count;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = count - 1;
    else if (event.key === "ArrowRight" && column === "hour") {
      event.preventDefault();
      minuteRefs.current[activeMinute]?.focus();
      return;
    } else if (event.key === "ArrowLeft" && column === "minute") {
      event.preventDefault();
      hourRefs.current[activeHour]?.focus();
      return;
    } else return;
    event.preventDefault();
    refs.current[next]?.focus();
  }

  return <div ref={rootRef} className="lesson-create-form__time-field">
    <div className="input lesson-create-form__time-control" aria-invalid={invalid}>
      <input id="lesson-start" name="start" type="text" autoComplete="off" maxLength={5} placeholder="ЧЧ:ММ" value={value} aria-invalid={invalid} aria-describedby={errorId} onPointerDown={() => { setOpen(false); }} onChange={(event) => { onChange(event.target.value); setOpen(false); }} onKeyDown={(event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          if (open) hourRefs.current[activeHour]?.focus();
          else openPanel();
        }
      }} />
      <button ref={triggerRef} type="button" className="lesson-create-form__time-picker" aria-label="Выбрать время" aria-expanded={open} aria-controls={open ? "lesson-time-panel" : undefined} onClick={() => { if (open) setOpen(false); else openPanel(); }}>
        <svg className="lesson-create-form__clock" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l-3 2" /></svg>
        <svg className="lesson-create-form__chevron" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m2 4 4 4 4-4" /></svg>
      </button>
    </div>
    {open ? <div id="lesson-time-panel" className={`lesson-create-form__time-panel${above ? " lesson-create-form__time-panel--above" : ""}`} role="group" aria-label="Выбор времени">
      <div className="lesson-create-form__time-column" role="group" aria-labelledby="lesson-hours-label">
        <span id="lesson-hours-label" className="lesson-create-form__time-column-label">Часы</span>
        <div className="lesson-create-form__time-options">
          {hours.map((hour, index) => <button key={hour} ref={(node) => { hourRefs.current[index] = node; }} type="button" className={`lesson-create-form__time-option${selected?.[1] === hour ? " lesson-create-form__time-option--selected" : ""}`} aria-pressed={selected?.[1] === hour} tabIndex={activeHour === index ? 0 : -1} onFocus={() => { setActiveHour(index); }} onKeyDown={(event) => { navigate(event, "hour", index); }} onClick={() => { chooseHour(hour); }}>{hour}</button>)}
        </div>
      </div>
      <div className="lesson-create-form__time-column" role="group" aria-labelledby="lesson-minutes-label">
        <span id="lesson-minutes-label" className="lesson-create-form__time-column-label">Минуты</span>
        <div className="lesson-create-form__time-options">
          {minuteSuggestions.map((minute, index) => <button key={minute} ref={(node) => { minuteRefs.current[index] = node; }} type="button" className={`lesson-create-form__time-option${selected?.[2] === minute ? " lesson-create-form__time-option--selected" : ""}`} aria-pressed={selected?.[2] === minute} tabIndex={activeMinute === index ? 0 : -1} onFocus={() => { setActiveMinute(index); }} onKeyDown={(event) => { navigate(event, "minute", index); }} onClick={() => { chooseMinute(minute); }}>{minute}</button>)}
        </div>
      </div>
    </div> : null}
  </div>;
}
