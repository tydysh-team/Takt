from enum import StrEnum


class RoleCode(StrEnum):
    ADMIN = "ADMIN"
    TEACHER = "TEACHER"
    STUDENT = "STUDENT"


class RelationStatus(StrEnum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"


class LessonStatus(StrEnum):
    PLANNED = "planned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class AttendanceValue(StrEnum):
    PRESENT = "PRESENT"
    ABSENT = "ABSENT"


class AttendanceStatus(StrEnum):
    NOT_SET = "not_set"
    PRESENT = "present"
    ABSENT = "absent"

