import type { LessonReadDTO, RoleCode } from "../../api/types";

export interface SchedulePersonContext {
  id: string;
  name: string;
}

export interface ScheduleViewContext {
  teacher?: SchedulePersonContext;
  student?: SchedulePersonContext;
}

export interface SchedulePresentation {
  title: string;
  description: string;
  showPersonalScheduleLink: boolean;
}

export function schedulePresentation(role: RoleCode | undefined, context: ScheduleViewContext): SchedulePresentation {
  if (role === "STUDENT") {
    if (context.teacher) {
      return {
        title: "Расписание преподавателя",
        description: `${context.teacher.name} · Только ваши занятия с этим преподавателем.`,
        showPersonalScheduleLink: true,
      };
    }
    return {
      title: "Моё расписание",
      description: "Все ваши занятия с преподавателями на текущую неделю.",
      showPersonalScheduleLink: false,
    };
  }

  if (context.student) {
    return {
      title: "Расписание ученика",
      description: `${context.student.name} · Занятия выбранного ученика на текущую неделю.`,
      showPersonalScheduleLink: false,
    };
  }

  return {
    title: "Неделя занятий",
    description: "Все запланированные уроки на текущую неделю.",
    showPersonalScheduleLink: false,
  };
}

export function filterLessonsForSchedule(
  lessons: LessonReadDTO[],
  role: RoleCode | undefined,
  context: ScheduleViewContext,
  viewerId?: string,
): LessonReadDTO[] {
  const roleScopedLessons = role === "STUDENT" && viewerId
    ? lessons.filter((lesson) => lesson.student.id === viewerId)
    : lessons;

  if (role === "STUDENT" && context.teacher) {
    return roleScopedLessons.filter((lesson) => lesson.teacher.id === context.teacher?.id);
  }
  if (role === "TEACHER" && context.student) {
    return roleScopedLessons.filter((lesson) => lesson.student.id === context.student?.id);
  }
  return roleScopedLessons;
}

