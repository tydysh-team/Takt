import { environment } from "../shared/config/environment";
import { apiSettings } from "../shared/config/api-settings";
import { resolveApiUrl } from "../shared/config/api-url";

import type { AccessTokenResponse, ApiErrorEnvelope } from "./types";

export interface ApiErrorDetail {
  location: (string | number)[];
  code: string;
  message: string;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: ApiErrorDetail[];
  readonly context: Record<string, unknown> | null;

  constructor(code: string, message: string, status: number, details: ApiErrorDetail[] = [], context: Record<string, unknown> | null = null) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
    this.context = context;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: HeadersInit;
  signal?: AbortSignal;
  body?: unknown;
  authenticated?: boolean;
  retryAfterRefresh?: boolean;
  csrf?: boolean;
}

let accessToken: string | null = null;
let refreshRequest: Promise<string> | null = null;
let sessionExpiredHandler: (() => void) | null = null;

export function buildApiUrl(path: string): URL {
  return resolveApiUrl(environment.apiBaseUrl, path, apiSettings.prefix);
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function onSessionExpired(handler: (() => void) | null): void {
  sessionExpiredHandler = handler;
}

function csrfToken(): string | null {
  const cookiePrefix = `${apiSettings.csrfCookieName}=`;
  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(cookiePrefix));

  return cookie ? decodeURIComponent(cookie.slice(cookiePrefix.length)) : null;
}

function isErrorEnvelope(value: unknown): value is ApiErrorEnvelope {
  if (typeof value !== "object" || value === null || !("error" in value)) return false;
  const error = value.error;
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    "message" in error &&
    typeof error.message === "string"
  );
}

async function responseError(response: Response): Promise<ApiError> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (isErrorEnvelope(payload)) {
    return new ApiError(
      payload.error.code,
      payload.error.message,
      response.status,
      payload.error.details ?? [],
      payload.error.context ?? null,
    );
  }

  return new ApiError(
    response.status === 401 ? "authentication_required" : "request_failed",
    "Не удалось выполнить запрос. Попробуйте ещё раз.",
    response.status,
  );
}

async function execute<T>(path: string, options: RequestOptions): Promise<T> {
  const { body, authenticated = true, csrf = false } = options;
  const headers = new Headers(options.headers);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  if (authenticated && accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  if (csrf) {
    const token = csrfToken();
    if (token) headers.set(apiSettings.csrfHeaderName, token);
  }

  const requestInit: RequestInit = {
    headers,
    credentials: "include",
    body: body === undefined ? null : JSON.stringify(body),
  };
  if (options.method) requestInit.method = options.method;
  if (options.signal) requestInit.signal = options.signal;
  let response: Response;
  try {
    response = await fetch(buildApiUrl(path), requestInit);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(
      "network_error",
      "Не удалось связаться с сервером. Проверьте подключение и повторите попытку.",
      0,
    );
  }

  if (!response.ok) throw await responseError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function refreshAccessToken(): Promise<string> {
  if (refreshRequest) return refreshRequest;

  refreshRequest = execute<AccessTokenResponse>("/auth/refresh", {
    method: "POST",
    authenticated: false,
    retryAfterRefresh: false,
    csrf: true,
  })
    .then((response) => {
      setAccessToken(response.access_token);
      return response.access_token;
    })
    .catch((error: unknown) => {
      setAccessToken(null);
      throw error;
    })
    .finally(() => {
      refreshRequest = null;
    });

  return refreshRequest;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  try {
    return await execute<T>(path, options);
  } catch (error) {
    const canRefresh =
      error instanceof ApiError &&
      error.status === 401 &&
      options.authenticated !== false &&
      options.retryAfterRefresh !== false;

    if (!canRefresh) throw error;

    try {
      await refreshAccessToken();
    } catch (refreshError) {
      sessionExpiredHandler?.();
      throw refreshError;
    }

    return execute<T>(path, { ...options, retryAfterRefresh: false });
  }
}

export function readableError(error: unknown): string {
  if (!(error instanceof ApiError)) return "Произошла непредвиденная ошибка.";

  const messages: Record<string, string> = {
    invalid_credentials: "Неверный email или пароль.",
    email_already_registered: "Пользователь с таким email уже зарегистрирован.",
    rate_limit_exceeded: "Слишком много попыток. Повторите позже.",
    invitation_invalid: "Код недействителен, истёк или уже использован.",
    invitation_not_active: "Приглашение больше не активно.",
    already_connected: "Вы уже подключены к этому преподавателю.",
    connection_not_found: "Активная связь не найдена.",
    csrf_failed: "Сессия устарела. Войдите снова.",
    forbidden: "У вас нет доступа к этой операции.",
    validation_error: "Проверьте заполнение полей.",
    lesson_start_in_past: "Нельзя создать занятие в прошлом.",
    student_not_available: "Выбранный ученик недоступен.",
    network_error: "Не удалось связаться с сервером. Проверьте подключение и повторите попытку.",
  };

  return messages[error.code] ?? error.message;
}

