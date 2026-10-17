import { describe, expect, it } from "vitest";

import { formatInvitationCode, isValidInvitationCode } from "./invitation-code";

describe("formatInvitationCode", () => {
  it("normalizes pasted input into the visual invitation format", () => {
    expect(formatInvitationCode("a7kd 9pqm-2x")).toBe("A7KD-9PQM-2X");
  });

  it("limits input to ten alphanumeric characters", () => {
    expect(formatInvitationCode("abcd1234ef-extra")).toBe("ABCD-1234-EF");
  });

  it("rejects excluded alphabet characters", () => {
    expect(isValidInvitationCode("A7KD-9PQM-2X")).toBe(true);
    expect(isValidInvitationCode("I7KD-9PQM-2X")).toBe(false);
    expect(isValidInvitationCode("A0KD-9PQM-2X")).toBe(false);
  });
});
