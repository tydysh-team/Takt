# Backend: authentication и security

## Password и login

- `PasswordService` использует Argon2id: `time_cost=3`, `memory_cost=65536`, `parallelism=4`, hash 32 bytes, salt 16 bytes.
- Registration policy: минимум 10 символов, хотя бы lowercase, uppercase, digit и non-alphanumeric. Frontend повторяет policy для UX, backend Pydantic — authoritative validation.
- Неизвестный email вызывает dummy Argon2 verify, уменьшая timing-различие. Login для inactive возвращает тот же `invalid_credentials`.
- Устаревший Argon2 hash rehash-ится при успешном login.

## Access JWT

HS256 JWT содержит обязательные `sub`, single `role`, `type=access`, `jti`, `iat`, `exp`, `iss`, `aud`. TTL задаёт `ACCESS_TOKEN_TTL_MINUTES` (пример — 15). Dependency проверяет подпись/issuer/audience/expiry/type, UUID claims, затем существование User и точное совпадение claim role с `User.role`.

## Refresh session, cookies, CSRF

- Refresh token — 48-byte URL-safe opaque random value. В `RefreshSession` хранится только HMAC-SHA256 digest с отдельным `REFRESH_TOKEN_HMAC_KEY`.
- `takt_refresh`: HttpOnly, SameSite=Lax, path `/api/v1/auth`; Secure только в production.
- `takt_csrf`: readable cookie, SameSite=Lax, path `/`; значение должно совпасть с `X-CSRF-Token` через `hmac.compare_digest`.
- Refresh и logout требуют CSRF. Login создаёт обе cookies.
- Rotation одноразовая: использованная запись получает `revoked_at`, новая сохраняет `family_id`.
- Replay revoked token отзывает все ещё активные записи family. Клиент получает общий `authentication_required`, без раскрытия причины.
- Logout отзывает текущую server-side запись и очищает обе cookies.

```mermaid
sequenceDiagram
    participant B as Browser
    participant R as Auth Router
    participant S as AuthService
    participant DB as PostgreSQL
    B->>R: POST /auth/login {email,password}
    R->>R: rate limit by HMAC(IP)
    R->>S: login(LoginRequest)
    S->>DB: User + Profile FOR UPDATE
    S->>S: Argon2id verify / optional rehash
    S->>DB: INSERT RefreshSession(token HMAC)
    S->>DB: COMMIT
    S-->>R: access JWT + raw refresh + CSRF
    R-->>B: 200 JWT; HttpOnly refresh + CSRF cookies
```

```mermaid
sequenceDiagram
    participant B as Browser
    participant R as Auth Router
    participant S as AuthService
    participant DB as PostgreSQL
    B->>R: POST /auth/refresh + cookies + X-CSRF-Token
    R->>R: constant-time CSRF match
    R->>S: refresh(raw token)
    S->>DB: SELECT digest FOR UPDATE
    alt valid and active
        S->>DB: revoke old; insert new same family; COMMIT
        S-->>R: new access/refresh/CSRF
        R-->>B: 200 + rotated cookies
    else revoked token replay
        S->>DB: revoke active family; COMMIT
        R-->>B: 401; clear cookies
    else missing/expired/inactive
        S->>DB: revoke when applicable
        R-->>B: 401; clear cookies
    end
```

## Invitations

Код содержит 10 символов из алфавита без неоднозначных знаков и показывается как `XXXX-XXXX-XX`. В DB — только HMAC-SHA256 с независимым `INVITATION_CODE_SECRET`. Invitation имеет expiry, revoke и one-time `used_at`/`used_by_student_id`; accept использует row lock и одну транзакцию.

## Authorization, CORS и rate limit

- `get_current_active_user` и role dependencies являются backend security boundary. Single role: `ADMIN | TEACHER | STUDENT`.
- CORS принимает только `CORS_ORIGINS`, credentials enabled, ограниченные methods/headers. В development configured localhost автоматически дополняется 127.0.0.1 (или наоборот). Private Network Access разрешается только вне production и при флаге.
- `TrustedHostMiddleware` ограничивает Host. Security headers: `nosniff`, `DENY`, no-referrer, restrictive Permissions-Policy; HSTS опционален.
- `InMemoryRateLimiter` ограничивает register/login/invitation accept по HMAC(IP). Состояние process-local и не разделяется между replicas; это baseline, не distributed limiter.

## SQLAdmin

`/admin` использует отдельную signed session cookie `takt_admin`, lifetime 8 часов, SameSite=Lax, Secure в production. Login принимает email в поле username, разрешает только active `User.role == ADMIN`, проверяет Argon2 и при необходимости rehash. SQLAdmin не принимает обычный access JWT. Views запрещают произвольное создание пользователей; sensitive hashes/digests не включены в displayed columns.

## Secrets и error leakage

Settings загружаются из environment. Независимы `JWT_SECRET_KEY`, `REFRESH_TOKEN_HMAC_KEY`, `RATE_LIMIT_HMAC_KEY`, `INVITATION_CODE_SECRET`, `ADMIN_SESSION_SECRET`; minimum length 32. Production отвергает значения с `replace`, `test`, `default`. `.env.example` содержит placeholders, реальные значения не должны попадать в Git или images.

Canonical errors содержат только safe code/message/details. Необработанные exceptions логируются server-side с method/path, клиент получает `internal_error`; request bodies, credentials и stack trace наружу не возвращаются.
