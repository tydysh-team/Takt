export const DEFAULT_TIMEZONE = "Europe/Moscow";

export const TIMEZONE_OPTIONS = [
  { value: "Europe/Kaliningrad", label: "UTC+02:00 — Калининград" },
  { value: DEFAULT_TIMEZONE, label: "UTC+03:00 — Москва" },
  { value: "Europe/Samara", label: "UTC+04:00 — Самара" },
  { value: "Asia/Yekaterinburg", label: "UTC+05:00 — Екатеринбург" },
  { value: "Asia/Novosibirsk", label: "UTC+07:00 — Новосибирск" },
  { value: "Asia/Vladivostok", label: "UTC+10:00 — Владивосток" },
  { value: "UTC", label: "UTC+00:00 — UTC" },
] as const;
