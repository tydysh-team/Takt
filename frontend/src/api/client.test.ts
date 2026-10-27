import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/config/environment", () => ({
  environment: { apiBaseUrl: "http://api.example" },
}));

import {
  apiRequest,
  getAccessToken,
  onSessionExpired,
  setAccessToken,
} from "./client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function requestPath(input: string | URL | Request): string {
  if (typeof input === "string") return new URL(input).pathname;
  if (input instanceof URL) return input.pathname;
  return new URL(input.url).pathname;
}

afterEach(() => {
  setAccessToken(null);
  onSessionExpired(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("API client session behavior", () => {
  it("keeps the access token in memory and sends it as Bearer authorization", async () => {
    const storageWrite = vi.fn();
    vi.stubGlobal("localStorage", { setItem: storageWrite });
    const request = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ status: "ok" }));
    vi.stubGlobal("fetch", request);

    setAccessToken("memory-only-token");
    await apiRequest<{ status: string }>("/health");

    expect(getAccessToken()).toBe("memory-only-token");
    expect(storageWrite).not.toHaveBeenCalled();
    const requestInit = request.mock.calls[0]?.[1];
    expect(new Headers(requestInit?.headers).get("Authorization")).toBe(
      "Bearer memory-only-token",
    );
  });

  it("converts the canonical backend envelope to a stable typed error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse(
          { error: { code: "invalid_credentials", message: "Safe message", details: [] } },
          401,
        ),
      ),
    );

    const result = apiRequest("/api/v1/auth/login", {
      authenticated: false,
      retryAfterRefresh: false,
    });

    await expect(result).rejects.toMatchObject({
      code: "invalid_credentials",
      message: "Safe message",
      status: 401,
    });
  });

  it("converts a browser network or CORS failure to a safe typed error", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(
      apiRequest("/api/v1/auth/login", {
        authenticated: false,
        retryAfterRefresh: false,
      }),
    ).rejects.toMatchObject({
      code: "network_error",
      status: 0,
      message: "Не удалось связаться с сервером. Проверьте подключение и повторите попытку.",
    });
  });

  it("uses one CSRF-protected refresh for simultaneous 401 responses", async () => {
    let releaseRefresh: (() => void) | undefined;
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    let protectedCalls = 0;
    let refreshCalls = 0;
    const refreshRequestInits: RequestInit[] = [];
    vi.stubGlobal("document", { cookie: "takt_csrf=csrf-value" });
    const request = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const path = requestPath(input);
      if (path === "/api/v1/auth/refresh") {
        refreshCalls += 1;
        refreshRequestInits.push(init ?? {});
        await refreshGate;
        return jsonResponse({ access_token: "rotated-token", token_type: "bearer", expires_in: 900 });
      }
      protectedCalls += 1;
      return protectedCalls <= 2
        ? jsonResponse({ error: { code: "authentication_required", message: "Expired", details: [] } }, 401)
        : jsonResponse({ ok: true });
    });
    vi.stubGlobal("fetch", request);
    setAccessToken("expired-token");

    const first = apiRequest<{ ok: boolean }>("/api/v1/dashboard/summary");
    const second = apiRequest<{ ok: boolean }>("/api/v1/profile");
    await vi.waitFor(() => {
      expect(refreshCalls).toBe(1);
    });
    releaseRefresh?.();

    await expect(Promise.all([first, second])).resolves.toEqual([{ ok: true }, { ok: true }]);
    expect(refreshCalls).toBe(1);
    expect(new Headers(refreshRequestInits[0]?.headers).get("X-CSRF-Token")).toBe("csrf-value");
    expect(getAccessToken()).toBe("rotated-token");
  });
});
