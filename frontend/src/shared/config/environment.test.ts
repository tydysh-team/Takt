import { describe, expect, it } from "vitest";

import { resolveApiBaseUrl } from "./resolve-api-base-url";

describe("development API URL", () => {
  it("uses the frontend loopback hostname so refresh cookies stay on the same site", () => {
    expect(resolveApiBaseUrl("http://localhost:8000", "127.0.0.1")).toBe(
      "http://127.0.0.1:8000",
    );
    expect(resolveApiBaseUrl("http://127.0.0.1:8000", "localhost")).toBe(
      "http://localhost:8000",
    );
  });

  it("keeps configured remote API origins unchanged", () => {
    expect(resolveApiBaseUrl("https://api.example.test/", "app.example.test")).toBe(
      "https://api.example.test",
    );
  });
});
