import { Temporal } from "@js-temporal/polyfill";

export const DEFAULT_TIMEZONE = "Europe/Moscow";

const cityNames: Record<string, string> = {
  "Europe/Kaliningrad": "Калининград",
  "Europe/Moscow": "Москва",
  "Europe/Samara": "Самара",
  "Asia/Yekaterinburg": "Екатеринбург",
  "Asia/Novosibirsk": "Новосибирск",
  "Asia/Vladivostok": "Владивосток",
  "Europe/Warsaw": "Варшава",
  UTC: "UTC",
};

export function isIanaTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    Temporal.Now.instant().toZonedDateTimeISO(value);
    return true;
  } catch {
    return false;
  }
}

export function timezoneOrDefault(value: unknown): string {
  return typeof value === "string" && value && isIanaTimezone(value) ? value : DEFAULT_TIMEZONE;
}

export function browserTimezone(): string {
  try {
    return timezoneOrDefault(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export function timezoneOptions(current?: string) {
  const zones = new Set(["UTC", DEFAULT_TIMEZONE, ...Intl.supportedValuesOf("timeZone")]);
  if (current && isIanaTimezone(current)) zones.add(current);
  const now = Temporal.Now.instant();
  return [...zones].map((value) => {
    const city = cityNames[value] ?? value.split("/").at(-1)?.replaceAll("_", " ") ?? value;
    const offset = now.toZonedDateTimeISO(value).offset;
    return { value, label: `UTC${offset === "+00:00" ? "+00:00" : offset} — ${city}`, city };
  }).sort((a, b) => a.label.localeCompare(b.label, "ru"));
}
