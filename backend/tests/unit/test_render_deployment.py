from fastapi import FastAPI, Response
from fastapi.testclient import TestClient

from app.api.cookies import set_auth_cookies
from app.core.config import Settings
from app.core.static import SpaStaticFiles


def test_render_postgres_url_uses_asyncpg(monkeypatch) -> None:
    monkeypatch.setenv("RENDER_EXTERNAL_HOSTNAME", "takt-web.onrender.com")
    settings = Settings(database_url="postgresql://user:pass@db:5432/takt", _env_file=None)

    assert settings.database_url == "postgresql+asyncpg://user:pass@db:5432/takt"


def test_production_host_and_auth_cookies(monkeypatch) -> None:
    monkeypatch.setenv("RENDER_EXTERNAL_HOSTNAME", "takt-web.onrender.com")
    settings = Settings(
        _env_file=None,
        app_env="production",
        database_url="postgresql://user:pass@db:5432/takt",
        jwt_secret_key="a" * 40,
        refresh_token_hmac_key="b" * 40,
        rate_limit_hmac_key="c" * 40,
        invitation_code_secret="d" * 40,
        admin_session_secret="e" * 40,
        totp_encryption_key="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        mfa_backup_hmac_key="f" * 40,
    )
    response = Response()
    set_auth_cookies(response, refresh_token="refresh", csrf_token="csrf", settings=settings)
    cookies = [value.decode() for name, value in response.raw_headers if name == b"set-cookie"]

    assert "takt-web.onrender.com" in settings.allowed_hosts
    assert any(
        "HttpOnly" in cookie and "Secure" in cookie and "SameSite=lax" in cookie
        for cookie in cookies if cookie.startswith("takt_refresh=")
    )
    assert any(
        "Secure" in cookie and "SameSite=lax" in cookie and "HttpOnly" not in cookie
        for cookie in cookies if cookie.startswith("takt_csrf=")
    )


def test_spa_refresh_does_not_hide_api_404(tmp_path) -> None:
    (tmp_path / "index.html").write_text("<html>Takt</html>", encoding="utf-8")
    application = FastAPI()
    application.mount("/", SpaStaticFiles(directory=tmp_path, html=True))

    with TestClient(application) as client:
        assert client.get("/schedule").text == "<html>Takt</html>"
        assert client.get("/api/v1/missing").status_code == 404
        assert client.get("/assets/missing.js").status_code == 404
