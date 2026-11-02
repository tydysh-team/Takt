import { describe, expect, it } from "vitest";

import { SUBJECT_TONES, subjectTone } from "./lesson-tone";

describe("subjectTone", () => {
  it("keeps known subjects in their familiar colours", () => {
    expect(subjectTone("История")).toBe("orange");
    expect(subjectTone("Математика")).toBe("purple");
    expect(subjectTone("Физика")).toBe("blue");
    expect(subjectTone("Английский")).toBe("blue");
    expect(subjectTone("Англ")).toBe("blue");
  });

  it("is deterministic for unknown titles", () => {
    const first = subjectTone("Биология");
    expect(subjectTone("Биология")).toBe(first);
    expect(subjectTone("  БИОЛОГИЯ  ")).toBe(first);
  });

  it("spreads unknown titles across more than one tone", () => {
    const titles = ["Ф", "Р", "ё", "Биология", "Химия", "География", "Информатика", "Литература"];
    const tones = new Set(titles.map((title) => subjectTone(title)));
    expect(tones.size).toBeGreaterThan(1);
    for (const tone of tones) expect(SUBJECT_TONES).toContain(tone);
  });
});
