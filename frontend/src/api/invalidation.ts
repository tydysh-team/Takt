import type { QueryClient } from "@tanstack/react-query";

export async function invalidateHomeworkRelated(
  client: QueryClient,
  role: "TEACHER" | "STUDENT",
  studentId?: string,
): Promise<void> {
  const requests = [client.invalidateQueries({ queryKey: ["homework"] })];
  if (role === "TEACHER" && studentId) {
    requests.push(client.invalidateQueries({ queryKey: ["progress", "TEACHER", studentId] }));
    requests.push(client.invalidateQueries({ queryKey: ["progress", "homework-statistics", studentId] }));
  } else if (role === "STUDENT") {
    requests.push(client.invalidateQueries({ queryKey: ["progress", "STUDENT", "me"] }));
  }
  await Promise.all(requests);
}

export async function invalidateLessonRelated(
  client: QueryClient,
  role: "TEACHER" | "STUDENT",
  studentId?: string,
): Promise<void> {
  const requests = [client.invalidateQueries({ queryKey: ["lessons"] })];
  if (role === "TEACHER" && studentId) {
    requests.push(client.invalidateQueries({ queryKey: ["progress", "TEACHER", studentId] }));
    requests.push(client.invalidateQueries({ queryKey: ["progress", "lesson-history", studentId] }));
  } else if (role === "STUDENT") {
    requests.push(client.invalidateQueries({ queryKey: ["progress", "STUDENT", "me"] }));
  }
  await Promise.all(requests);
}
