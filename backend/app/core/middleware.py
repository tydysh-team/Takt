from collections.abc import Mapping

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send


class SecurityHeadersMiddleware:
    """Add browser security headers to every HTTP response."""

    def __init__(
        self,
        app: ASGIApp,
        *,
        enable_hsts: bool = False,
        extra_headers: Mapping[str, str] | None = None,
    ) -> None:
        self.app = app
        self.enable_hsts = enable_hsts
        self.extra_headers = extra_headers or {}

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers["X-Content-Type-Options"] = "nosniff"
                headers["X-Frame-Options"] = "DENY"
                headers["Referrer-Policy"] = "no-referrer"
                headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
                if self.enable_hsts:
                    headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
                for name, value in self.extra_headers.items():
                    headers[name] = value
            await send(message)

        await self.app(scope, receive, send_with_headers)

