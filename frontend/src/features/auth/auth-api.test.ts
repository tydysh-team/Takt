import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../shared/config/environment", () => ({
  environment: { apiBaseUrl: "http://api.example" },
}));

import { getAccessToken, setAccessToken } from "../../api/client";
import { authApi } from "./auth-api";

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
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("auth API contract", () => {
  it("keeps MFA challenge separate from access tokens until verification", async () => {
    const paths: string[] = [];
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation((input) => {
      const path = requestPath(input);
      paths.push(path);
      return Promise.resolve(jsonResponse(path.endsWith("/login")
        ? { mfa_required: true, challenge: "temporary-challenge", expires_in: 300 }
        : { access_token: "verified-token", token_type: "bearer", expires_in: 900 }));
    }));
    const first = await authApi.login({ email: "teacher@example.com", password: "12345678" });
    expect("mfa_required" in first && first.mfa_required).toBe(true);
    expect(getAccessToken()).toBeNull();
    const verified = await authApi.verifyMfaLogin({ challenge: "temporary-challenge", code: "123456" });
    expect(verified.access_token).toBe("verified-token");
    expect(paths).toEqual(["/api/v1/auth/login", "/api/v1/auth/mfa/verify"]);
  });

  it("uses login followed by the top-level current-user endpoint", async () => {
    const paths: string[] = [];
    const request = vi.fn<typeof fetch>().mockImplementation((input) => {
      const path = requestPath(input);
      paths.push(path);
      if (path === "/api/v1/auth/login") {
        return Promise.resolve(jsonResponse({
          access_token: "access-token",
          token_type: "bearer",
          expires_in: 900,
        }));
      }
      return Promise.resolve(jsonResponse({
        id: "8f87f4b3-30ce-4fce-baf0-402ca849edc9",
        email: "teacher@example.com",
        role: "TEACHER",
        first_name: "Ada",
        last_name: "Lovelace",
        middle_name: null,
      }));
    });
    vi.stubGlobal("fetch", request);

    const login = await authApi.login({
      email: "teacher@example.com",
      password: "12345678",
    });
    if ("mfa_required" in login) throw new Error("Expected password-only login");
    setAccessToken(login.access_token);
    await expect(authApi.currentUser()).resolves.toMatchObject({
      email: "teacher@example.com",
      role: "TEACHER",
    });

    expect(paths).toEqual(["/api/v1/auth/login", "/api/v1/me"]);
  });

  it.each([
    ["missing fields", { role: "TEACHER" }],
    ["unsupported role", {
      id: "8f87f4b3-30ce-4fce-baf0-402ca849edc9",
      email: "teacher@example.com",
      role: "OWNER",
      first_name: "Ada",
      last_name: "Lovelace",
      middle_name: null,
    }],
    ["wrong field type", {
      id: "8f87f4b3-30ce-4fce-baf0-402ca849edc9",
      email: "teacher@example.com",
      role: "TEACHER",
      first_name: 42,
      last_name: "Lovelace",
      middle_name: null,
    }],
  ])("rejects HTTP 200 /me with %s", async (_description, body) => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(body)));

    await expect(authApi.currentUser()).rejects.toMatchObject({
      code: "invalid_response",
      status: 200,
    });
  });

  it("sends the detected timezone with registration", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        id: "user-id",
        email: "student@example.com",
        role: "STUDENT",
        first_name: "Grace",
        last_name: "Hopper",
        middle_name: null,
        created_at: "2026-10-15T00:00:00Z",
      }),
    );
    vi.stubGlobal("fetch", request);

    await authApi.register({
      email: "student@example.com",
      password: "12345678",
      first_name: "Grace",
      last_name: "Hopper",
      middle_name: null,
      role: "STUDENT",
      timezone: "Europe/Samara",
    });

    const init = request.mock.calls[0]?.[1];
    if (typeof init?.body !== "string") throw new Error("Expected a JSON request body");
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(body.timezone).toBe("Europe/Samara");
  });

  it("sends the CSRF header and refresh cookie credentials on logout", async () => {
    vi.stubGlobal("document", { cookie: "takt_csrf=logout-token" });
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", request);

    await authApi.logout();

    expect(requestPath(request.mock.calls[0]?.[0] ?? "http://api.example")).toBe("/api/v1/auth/logout");
    const init = request.mock.calls[0]?.[1];
    expect(init?.credentials).toBe("include");
    expect(new Headers(init?.headers).get("X-CSRF-Token")).toBe("logout-token");
  });

  it("sends password change with the access token and CSRF header", async () => {
    vi.stubGlobal("document", { cookie: "takt_csrf=change-token" });
    setAccessToken("access-token");
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", request);

    await authApi.changePassword({ current_password: "old-password", new_password: "new-password" });

    expect(requestPath(request.mock.calls[0]?.[0] ?? "http://api.example"))
      .toBe("/api/v1/auth/change-password");
    const init = request.mock.calls[0]?.[1];
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("include");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer access-token");
    expect(new Headers(init?.headers).get("X-CSRF-Token")).toBe("change-token");
    if (typeof init?.body !== "string") throw new Error("Expected a JSON request body");
    expect(JSON.parse(init.body)).toEqual({
      current_password: "old-password", new_password: "new-password",
    });
  });
});
