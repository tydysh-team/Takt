import { describe, expect, it } from "vitest";

import { resolveTheme, toggleTheme } from "./theme";

describe("theme", () => {
  it("falls back to light without a browser", () => {
    expect(resolveTheme()).toBe("light");
  });

  it("toggles deterministically", () => {
    expect(toggleTheme("light")).toBe("dark");
    expect(toggleTheme("dark")).toBe("light");
  });
});
