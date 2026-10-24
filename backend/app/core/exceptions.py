from typing import Any


class DomainError(Exception):
    """Base class for safe domain failures translated at the HTTP boundary."""

    code = "domain_error"
    message = "The operation could not be completed."

    def __init__(
        self,
        *,
        message: str | None = None,
        context: dict[str, Any] | None = None,
    ) -> None:
        self.safe_message = message or self.message
        self.context = context
        super().__init__(self.safe_message)


class EmailAlreadyRegisteredError(DomainError):
    code = "email_already_registered"
    message = "Пользователь с таким email уже зарегистрирован."


class InvalidCredentialsError(DomainError):
    code = "invalid_credentials"
    message = "Неверный email или пароль"


class AuthenticationRequiredError(DomainError):
    code = "authentication_required"
    message = "Требуется аутентификация."


class RefreshReplayError(AuthenticationRequiredError):
    """A consumed refresh token was presented again."""


class ForbiddenError(DomainError):
    code = "forbidden"
    message = "Операция недоступна."


class CsrfValidationError(DomainError):
    code = "csrf_failed"
    message = "Запрос не прошёл проверку безопасности."


class ProfileNotFoundError(DomainError):
    code = "profile_not_found"
    message = "Профиль не найден."


class InvalidInvitationError(DomainError):
    code = "invitation_invalid"
    message = "Код приглашения недействителен или больше не активен."


class InvitationNotFoundError(DomainError):
    code = "invitation_not_found"
    message = "Приглашение не найдено."


class InvitationNotActiveError(DomainError):
    code = "invitation_not_active"
    message = "Приглашение больше не активно."


class AlreadyConnectedError(DomainError):
    code = "already_connected"
    message = "Вы уже подключены к этому преподавателю."


class ConnectionNotFoundError(DomainError):
    code = "connection_not_found"
    message = "Активная связь не найдена."


class StudentNotAvailableError(DomainError):
    code = "student_not_available"
    message = "Ученик недоступен."


class LessonStartInPastError(DomainError):
    code = "lesson_start_in_past"
    message = "Нельзя создать занятие в прошлом."


class LessonNotFoundError(DomainError):
    code = "lesson_not_found"
    message = "Занятие не найдено."


class LessonTimeConflictError(DomainError):
    code = "lesson_time_conflict"
    message = "Найдено пересечение с другим занятием."


class LessonNotReschedulableError(DomainError):
    code = "lesson_not_reschedulable"
    message = "Перенести можно только запланированное занятие."


class LessonScheduleUnchangedError(DomainError):
    code = "lesson_schedule_unchanged"
    message = "Новое время совпадает с текущим временем занятия."


class LessonNotCancellableError(DomainError):
    code = "lesson_not_cancellable"
    message = "Отменить можно только запланированное занятие."


class RateLimitExceededError(DomainError):
    code = "rate_limit_exceeded"
    message = "Слишком много запросов. Повторите попытку позже."

    def __init__(self, *, retry_after: int) -> None:
        self.retry_after = retry_after
        super().__init__()
