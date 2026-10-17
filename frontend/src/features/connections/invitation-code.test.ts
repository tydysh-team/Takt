import { describe, expect, it } from "vitest";

import { formatInvitationCode } from "./invitation-code";

describe("formatInvitationCode", () => {
  it("normalizes pasted input into the visual invitation format", () => {
    expect(formatInvitationCode("a7kd 9pqm-2x")).toBe("A7KD-9PQM-2X");
  });

  it("limits input to ten alphanumeric characters", () => {
    expect(formatInvitationCode("abcd1234ef-extra")).toBe("ABCD-1234-EF");
  });
});
