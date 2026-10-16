from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.dependencies.auth import get_current_active_user, get_dashboard_service
from app.models.user import User
from app.repositories.teacher_student_relations import ConnectionRecord
from app.schemas.connections import StudentListItem, TeacherListItem
from app.schemas.dashboard import StudentDashboardResponse, TeacherDashboardResponse
from app.schemas.error import ErrorResponse
from app.services.dashboard import (
    DashboardService,
    StudentDashboard,
    TeacherDashboard,
)

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


def _student(record: ConnectionRecord) -> StudentListItem:
    return StudentListItem(
        id=record.user.id,
        first_name=record.profile.first_name,
        last_name=record.profile.last_name,
        email=record.user.email,
        timezone=record.profile.timezone,
        connected_at=record.relation.created_at,
        status=record.relation.status,
    )


def _teacher(record: ConnectionRecord) -> TeacherListItem:
    return TeacherListItem(
        id=record.user.id,
        first_name=record.profile.first_name,
        last_name=record.profile.last_name,
        email=record.user.email,
        timezone=record.profile.timezone,
        connected_at=record.relation.created_at,
    )


@router.get(
    "/summary",
    response_model=TeacherDashboardResponse | StudentDashboardResponse,
    summary="Get the role-aware dashboard summary",
    description="Returns connection and invitation metrics for teachers or students.",
    responses={403: {"model": ErrorResponse, "description": "Role has no dashboard"}},
)
async def dashboard_summary(
    user: Annotated[User, Depends(get_current_active_user)],
    service: Annotated[DashboardService, Depends(get_dashboard_service)],
) -> TeacherDashboardResponse | StudentDashboardResponse:
    summary = await service.summary(user)
    if isinstance(summary, TeacherDashboard):
        return TeacherDashboardResponse(
            students_count=summary.students_count,
            new_students_30d=summary.new_students_30d,
            active_invitations_count=summary.active_invitations_count,
            recent_students=[_student(record) for record in summary.recent_students],
        )
    if isinstance(summary, StudentDashboard):
        return StudentDashboardResponse(
            teachers_count=summary.teachers_count,
            recent_teachers=[_teacher(record) for record in summary.recent_teachers],
        )
    raise TypeError("Unsupported dashboard result")
