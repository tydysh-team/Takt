import { resolveApiBaseUrl } from "./resolve-api-base-url";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

if (!apiBaseUrl) {
  throw new Error("VITE_API_BASE_URL is required");
}

export const environment = Object.freeze({
  apiBaseUrl: resolveApiBaseUrl(
    apiBaseUrl,
    typeof window === "undefined" ? "" : window.location.hostname,
  ),
});

