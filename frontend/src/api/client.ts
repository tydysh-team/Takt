import { environment } from "../shared/config/environment";

export function buildApiUrl(path: string): URL {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return new URL(normalizedPath, `${environment.apiBaseUrl}/`);
}

