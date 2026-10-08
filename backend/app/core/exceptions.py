class DomainError(Exception):
    """Base class for safe domain failures translated at the HTTP boundary."""

    code = "domain_error"
    message = "The operation could not be completed."

    def __init__(self, *, message: str | None = None) -> None:
        self.safe_message = message or self.message
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


class RateLimitExceededError(DomainError):
    code = "rate_limit_exceeded"
    message = "Слишком много запросов. Повторите попытку позже."

    def __init__(self, *, retry_after: int) -> None:
        self.retry_after = retry_after
        super().__init__()

