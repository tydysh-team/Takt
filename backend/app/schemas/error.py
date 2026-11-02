from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ErrorDetail(BaseModel):
    model_config = ConfigDict(extra="forbid")

    location: list[str | int]
    code: str
    message: str


class ErrorBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    message: str
    details: list[ErrorDetail] = Field(default_factory=list)
    context: dict[str, Any] | None = None


class ErrorResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    error: ErrorBody

    @classmethod
    def from_values(
        cls,
        *,
        code: str,
        message: str,
        details: list[ErrorDetail] | None = None,
        context: dict[str, Any] | None = None,
    ) -> "ErrorResponse":
        return cls(
            error=ErrorBody(
                code=code,
                message=message,
                details=details or [],
                context=context,
            )
        )
