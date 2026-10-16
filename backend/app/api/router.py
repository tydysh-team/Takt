from fastapi import APIRouter

from app.api.routes.auth import router as auth_router
from app.api.routes.connections import router as connections_router
from app.api.routes.dashboard import router as dashboard_router
from app.api.routes.invitations import router as invitations_router
from app.api.routes.me import router as me_router
from app.api.routes.profile import router as profile_router
from app.api.routes.students import router as students_router
from app.api.routes.teachers import router as teachers_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(me_router)
api_router.include_router(invitations_router)
api_router.include_router(connections_router)
api_router.include_router(students_router)
api_router.include_router(teachers_router)
api_router.include_router(dashboard_router)
api_router.include_router(profile_router)

