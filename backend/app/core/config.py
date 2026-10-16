from functools import lru_cache
from typing import Literal

from pydantic import AnyHttpUrl, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Validated application settings loaded from the process environment."""

    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_name: str = "Takt API"
    app_env: Literal["development", "test", "production"] = "development"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"

    database_url: str
    test_database_url: str | None = None
    api_v1_prefix: str = "/api/v1"

    cors_origins: list[AnyHttpUrl] = Field(default_factory=list)
    cors_allow_private_network: bool = True
    trusted_hosts: list[str] = Field(default_factory=lambda: ["localhost", "127.0.0.1"])
    enable_hsts: bool = False

    jwt_secret_key: SecretStr = Field(min_length=32)
    refresh_token_hmac_key: SecretStr = Field(min_length=32)
    rate_limit_hmac_key: SecretStr = Field(min_length=32)
    invitation_code_secret: SecretStr = Field(min_length=32)
    admin_session_secret: SecretStr = Field(min_length=32)
    jwt_algorithm: Literal["HS256"] = "HS256"
    jwt_issuer: str = "takt-api"
    jwt_audience: str = "takt-web"
    access_token_ttl_minutes: int = Field(default=15, ge=1, le=60)
    refresh_token_ttl_days: int = Field(default=30, ge=1, le=90)
    invitation_ttl_days: int = Field(default=7, ge=1, le=30)

    refresh_cookie_name: str = "takt_refresh"
    csrf_cookie_name: str = "takt_csrf"
    csrf_header_name: str = "X-CSRF-Token"
    auth_cookie_path: str = "/api/v1/auth"
    csrf_cookie_path: str = "/"

    login_rate_limit: int = Field(default=5, ge=1, le=100)
    register_rate_limit: int = Field(default=3, ge=1, le=100)
    invitation_accept_rate_limit: int = Field(default=10, ge=1, le=100)
    rate_limit_window_seconds: int = Field(default=60, ge=1, le=3600)

    @field_validator("database_url")
    @classmethod
    def require_async_postgresql(cls, value: str) -> str:
        if not value.startswith("postgresql+asyncpg://"):
            raise ValueError("DATABASE_URL must use the postgresql+asyncpg driver")
        return value

    @field_validator("test_database_url")
    @classmethod
    def require_test_postgresql(cls, value: str | None) -> str | None:
        if value is not None and not value.startswith("postgresql+asyncpg://"):
            raise ValueError("TEST_DATABASE_URL must use the postgresql+asyncpg driver")
        return value

    @field_validator("api_v1_prefix")
    @classmethod
    def validate_api_prefix(cls, value: str) -> str:
        if not value.startswith("/") or value.endswith("/"):
            raise ValueError("API prefix must start with '/' and must not end with '/'")
        return value

    @field_validator(
        "jwt_issuer",
        "jwt_audience",
        "refresh_cookie_name",
        "csrf_cookie_name",
        "csrf_header_name",
    )
    @classmethod
    def require_non_empty_value(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Configuration value must not be empty")
        return value

    @field_validator("auth_cookie_path", "csrf_cookie_path")
    @classmethod
    def validate_auth_cookie_path(cls, value: str) -> str:
        if not value.startswith("/") or (value != "/" and value.endswith("/")):
            raise ValueError("Auth cookie path must start with '/' and must not end with '/'")
        return value

    @model_validator(mode="after")
    def reject_placeholder_production_secrets(self) -> "Settings":
        if self.app_env != "production":
            return self
        for secret in (
            self.jwt_secret_key,
            self.refresh_token_hmac_key,
            self.rate_limit_hmac_key,
            self.invitation_code_secret,
            self.admin_session_secret,
        ):
            value = secret.get_secret_value().lower()
            if "replace" in value or "test" in value or "default" in value:
                raise ValueError("Production security keys must not use placeholder values")
        return self

    @property
    def cors_origin_strings(self) -> list[str]:
        origins = [str(origin).rstrip("/") for origin in self.cors_origins]
        if self.app_env == "production":
            return origins

        # localhost and 127.0.0.1 are the same local frontend, but distinct CORS origins.
        # Accept the counterpart only when one of them was explicitly configured.
        for origin in self.cors_origins:
            if origin.host not in {"localhost", "127.0.0.1"}:
                continue
            counterpart = "127.0.0.1" if origin.host == "localhost" else "localhost"
            port = f":{origin.port}" if origin.port is not None else ""
            alternate = f"{origin.scheme}://{counterpart}{port}"
            if alternate not in origins:
                origins.append(alternate)
        return origins

    @property
    def secure_cookies(self) -> bool:
        return self.app_env == "production"

    @property
    def allow_private_network_cors(self) -> bool:
        """Allow browser local-network preflights outside production only."""
        return self.app_env != "production" and self.cors_allow_private_network


@lru_cache
def get_settings() -> Settings:
    return Settings()

