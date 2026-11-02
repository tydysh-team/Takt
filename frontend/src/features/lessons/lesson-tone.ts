export const SUBJECT_TONES = [
  "green",
  "blue",
  "purple",
  "orange",
  "teal",
  "amber",
  "rose",
  "indigo",
  "cyan",
  "lime",
] as const;

export type SubjectTone = (typeof SUBJECT_TONES)[number];

/**
 * Maps a lesson title to a stable visual tone. Known subjects keep their
 * familiar colours; anything else gets a deterministic colour from a hash, so
 * the same title always looks the same and new subjects do not all turn green.
 */
export function subjectTone(title: string): SubjectTone {
  const subject = title.trim().toLocaleLowerCase("ru-RU");
  if (subject.includes("истор")) return "orange";
  if (subject.includes("математ") || subject.includes("матем")) return "purple";
  if (subject.includes("физик") || subject.includes("физ")) return "blue";
  if (subject.includes("англий") || subject.includes("англ")) return "blue";

  let hash = 2166136261;
  for (let index = 0; index < subject.length; index += 1) {
    hash ^= subject.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return SUBJECT_TONES[(hash >>> 0) % SUBJECT_TONES.length] ?? "green";
}
