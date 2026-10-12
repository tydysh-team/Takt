from enum import StrEnum


class RoleCode(StrEnum):
    ADMIN = "ADMIN"
    TEACHER = "TEACHER"
    STUDENT = "STUDENT"


class RelationStatus(StrEnum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"

