import { useLayoutEffect, useRef, type ChangeEvent, type CompositionEvent, type FocusEvent } from "react";

type InputKind = "date" | "time";

export function formatLessonInputEdit({ kind, previous, value, start = value.length, end = start, inputType = "" }: {
  kind: InputKind;
  previous: string;
  value: string;
  start?: number;
  end?: number;
  inputType?: string;
}) {
  const normalized = kind === "time" ? value.replaceAll(".", ":") : value;
  const deleting = inputType.startsWith("delete") || inputType.startsWith("history")
    || (!inputType && value.length < previous.length);
  // Deleting a separator must not immediately put it back. Invalid characters
  // also remain visible so that validation can explain the error.
  if (deleting || !(kind === "date" ? /^[\d.]*$/ : /^[\d:]*$/).test(normalized)) {
    return { value: normalized, start, end };
  }
  const separator = kind === "date" ? "." : ":";
  const widths = kind === "date" ? [2, 2, 4] : [2, 2];
  const positions = [0];
  let result = "";
  let field = 0;
  let digits = 0;
  for (const character of normalized) {
    if (character === separator) {
      field += 1;
      digits = 0;
    } else {
      if (field < widths.length - 1 && digits >= widths[field]!) {
        result += separator;
        field += 1;
        digits = 0;
      }
      digits += 1;
    }
    result += character;
    positions.push(result.length);
  }
  return { value: result, start: positions[start] ?? result.length, end: positions[end] ?? result.length };
}

export function useLessonInputFormat(kind: InputKind, value: string, onChange: (value: string) => void) {
  const ref = useRef<HTMLInputElement>(null);
  const selection = useRef<{ start: number; end: number; direction: "forward" | "backward" | "none" } | null>(null);

  useLayoutEffect(() => {
    if (selection.current && ref.current === document.activeElement) {
      const { start, end, direction } = selection.current;
      ref.current?.setSelectionRange(start, end, direction);
    }
    selection.current = null;
  }, [value]);

  function apply(input: HTMLInputElement, inputType: string) {
    const formatted = formatLessonInputEdit({
      kind, previous: value, value: input.value,
      start: input.selectionStart ?? input.value.length,
      end: input.selectionEnd ?? input.value.length, inputType,
    });
    const direction = input.selectionDirection ?? "none";
    selection.current = formatted.value !== value ? { start: formatted.start, end: formatted.end, direction } : null;
    // Also restore synchronously when normalization produces the previous React
    // value and React therefore has no state update to render.
    input.value = formatted.value;
    input.setSelectionRange(formatted.start, formatted.end, direction);
    if (formatted.value !== value) onChange(formatted.value);
  }

  return {
    ref,
    onChange(event: ChangeEvent<HTMLInputElement>) {
      const native = event.nativeEvent as InputEvent;
      if (native.isComposing) {
        onChange(event.currentTarget.value);
        return;
      }
      apply(event.currentTarget, native.inputType ?? "");
    },
    onCompositionEnd(event: CompositionEvent<HTMLInputElement>) {
      apply(event.currentTarget, "insertCompositionText");
    },
    onBlur(event: FocusEvent<HTMLInputElement>) {
      apply(event.currentTarget, "insertReplacementText");
    },
  };
}
