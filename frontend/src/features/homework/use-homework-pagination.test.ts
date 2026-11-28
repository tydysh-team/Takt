import { describe, expect, it } from "vitest";

import { clampOffset, clampPage, pageCount, pageOffset } from "./use-homework-pagination";

describe("homework pagination math", () => {
  it("counts pages for the default size of five", () => {
    expect(pageCount(0, 5)).toBe(1);
    expect(pageCount(1, 5)).toBe(1);
    expect(pageCount(5, 5)).toBe(1);
    expect(pageCount(6, 5)).toBe(2);
    expect(pageCount(13, 5)).toBe(3);
    expect(pageCount(12, 10)).toBe(2);
  });

  it("never reports zero or negative pages", () => {
    expect(pageCount(-3, 5)).toBe(1);
    expect(pageCount(10, 0)).toBe(1);
    expect(pageCount(Number.NaN, 5)).toBe(1);
  });

  it("clamps a page into the available range", () => {
    expect(clampPage(0, 12, 5)).toBe(0);
    expect(clampPage(2, 12, 5)).toBe(2);
    expect(clampPage(7, 12, 5)).toBe(2);
    expect(clampPage(-4, 12, 5)).toBe(0);
    expect(clampPage(3, 0, 5)).toBe(0);
    expect(clampPage(1.9, 12, 5)).toBe(1);
  });

  it("converts between page and offset", () => {
    expect(pageOffset(0, 5)).toBe(0);
    expect(pageOffset(3, 5)).toBe(15);
    expect(pageOffset(-1, 5)).toBe(0);
    expect(clampOffset(20, 12, 5)).toBe(10);
    expect(clampOffset(10, 12, 5)).toBe(10);
    expect(clampOffset(0, 0, 5)).toBe(0);
    expect(clampOffset(15, 20, 5)).toBe(15);
  });
});
