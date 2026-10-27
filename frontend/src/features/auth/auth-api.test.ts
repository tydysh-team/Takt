import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../shared/config/environment", () => ({
  environment: { apiBaseUrl: "http://api.example" },
}));

import { setAccessToken } from "../../api/client";
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
});
