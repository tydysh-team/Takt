function configuredValue(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  return trimmed;
}

const configuredPrefix = configuredValue(import.meta.env.VITE_API_PREFIX, "/api/v1");

export const apiSettings = Object.freeze({
  prefix: `/${configuredPrefix.replace(/^\/+|\/+$/g, "")}`,
  csrfCookieName: configuredValue(import.meta.env.VITE_CSRF_COOKIE_NAME, "takt_csrf"),
  csrfHeaderName: configuredValue(import.meta.env.VITE_CSRF_HEADER_NAME, "X-CSRF-Token"),
});
