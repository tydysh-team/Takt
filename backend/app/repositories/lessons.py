from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lesson import Lesson


class LessonRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    def add(self, lesson: Lesson) -> None:
        self._session.add(lesson)
