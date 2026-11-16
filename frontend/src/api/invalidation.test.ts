import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { invalidateHomeworkRelated, invalidateLessonRelated } from "./invalidation";

function seededClient() {
  const client = new QueryClient();
  const keys = [
    ["homework", "TEACHER", "all", 0],
    ["lessons", "week"],
    ["progress", "TEACHER", "student-1", "from", "to"],
    ["progress", "TEACHER", "student-2", "from", "to"],
    ["progress", "homework-statistics", "student-1", "from", "to"],
    ["progress", "lesson-history", "student-1", "from", "to"],
    ["progress", "STUDENT", "me", "from", "to"],
  ] as const;
  keys.forEach((key) => { client.setQueryData(key, { value: 1 }); });
  return { client, keys };
}

describe("related query invalidation", () => {
  it("updates only the affected teacher's homework statistics and progress", async () => {
    const { client, keys } = seededClient();
    await invalidateHomeworkRelated(client, "TEACHER", "student-1");
    expect(client.getQueryState(keys[0])?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys[2])?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys[4])?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys[3])?.isInvalidated).toBe(false);
    expect(client.getQueryState(keys[5])?.isInvalidated).toBe(false);
  });

  it("updates lesson history and progress after an attendance or schedule change", async () => {
    const { client, keys } = seededClient();
    await invalidateLessonRelated(client, "TEACHER", "student-1");
    expect(client.getQueryState(keys[1])?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys[2])?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys[5])?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys[3])?.isInvalidated).toBe(false);
    expect(client.getQueryState(keys[4])?.isInvalidated).toBe(false);
  });

  it("updates the authenticated student's progress", async () => {
    const { client, keys } = seededClient();
    await invalidateHomeworkRelated(client, "STUDENT");
    expect(client.getQueryState(keys[6])?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys[2])?.isInvalidated).toBe(false);
  });
});
