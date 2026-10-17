import { describe, expect, it } from "vitest";

import { formatFullName, fullName } from "./format";

describe("profile name formatting", () => {
  it("uses short display name on cards", () => {
    expect(fullName({ first_name: " Максим ", last_name: " Шаменков " })).toBe("Максим Шаменков");
  });

  it("formats full name with optional middle name", () => {
    expect(formatFullName({ first_name: "Максим", last_name: "Шаменков", middle_name: "Александрович" }))
      .toBe("Шаменков Максим Александрович");
    expect(formatFullName({ first_name: "Максим", last_name: "Шаменков", middle_name: null }))
      .toBe("Шаменков Максим");
  });
});
