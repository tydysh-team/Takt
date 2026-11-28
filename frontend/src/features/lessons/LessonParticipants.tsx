import type { LessonAttendance, LessonReadDTO } from "../../api/types";

export function participantIds(lesson: LessonReadDTO): string[] {
  const ids = lesson.participants?.flatMap((p) => "id" in p ? [p.id] : []) ?? [];
  return ids.length ? ids : lesson.student ? [lesson.student.id] : [];
}

export function groupLabel(lesson: LessonReadDTO): string {
  const count = lesson.participant_count ?? 1;
  const last = count % 10;
  const suffix = count % 100 >= 11 && count % 100 <= 14 ? "учеников"
    : last === 1 ? "ученик" : last >= 2 && last <= 4 ? "ученика" : "учеников";
  return `👥 ${String(count)} ${suffix}`;
}

const labels = { present: "Присутствовал", absent: "Отсутствовал", not_set: "Не отмечено" } as const;

export function LessonParticipants({ lesson, isTeacher, canUpdate, pending, onAttendance }: {
  lesson: LessonReadDTO;
  isTeacher: boolean;
  canUpdate: boolean;
  pending: boolean;
  onAttendance: (attendance: LessonAttendance, studentId: string) => void;
}) {
  return <section aria-label="Участники занятия">
    <p>Групповое занятие · {groupLabel(lesson)}</p>
    <ul className="lesson-participants">
      {lesson.participants?.map((participant, index) => <li key={"id" in participant ? participant.id : index}>
        <span>{participant.first_name} {participant.last_name}{"is_self" in participant && participant.is_self ? " — Вы" : ""}</span>
        {isTeacher && "attendance" in participant ? <>
          <span>{labels[participant.attendance]}</span>
          {canUpdate ? <div className="selected-lesson-details__actions">
            {(["present", "absent", "not_set"] as const).map((value) => <button type="button" className="button button--secondary" key={value} aria-pressed={participant.attendance === value} disabled={pending} onClick={() => { onAttendance(value, participant.id); }}>{labels[value]}</button>)}
          </div> : null}
        </> : null}
      </li>)}
    </ul>
  </section>;
}
