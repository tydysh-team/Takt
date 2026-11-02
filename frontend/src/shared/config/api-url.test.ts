import { describe, expect, it } from "vitest";

import { resolveApiUrl } from "./api-url";

describe("API URL construction", () => {
  it("adds the prefix once for bare and already-prefixed base URLs", () => {
    expect(resolveApiUrl("https://api.example", "/lessons/search", "/api/v1").href).toBe("https://api.example/api/v1/lessons/search");
    expect(resolveApiUrl("https://api.example/api/v1", "/lessons/search", "/api/v1").href).toBe("https://api.example/api/v1/lessons/search");
    expect(resolveApiUrl("https://api.example/api/v1", "/api/v1/auth/login", "/api/v1").href).toBe("https://api.example/api/v1/auth/login");
  });

  it("preserves a configured host path and query parameters", () => {
    expect(resolveApiUrl("https://api.example/backend", "/lessons?limit=2", "/api/v1").href).toBe("https://api.example/backend/api/v1/lessons?limit=2");
  });
});
