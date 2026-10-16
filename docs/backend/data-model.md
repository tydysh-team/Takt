# Backend: модель данных

Актуальная схема после `alembic upgrade head` содержит 7 application tables. Типы ниже — PostgreSQL-типы; время хранится как `timestamp with time zone`.

## `users`

| Поле | Тип | NULL | PK/FK/Unique | Default | Назначение |
|---|---|---:|---|---|---|
| `id` | `uuid` | нет | PK `pk_users` | UUID в приложении | Идентификатор аккаунта |
| `email` | `varchar(320)` | нет | Unique `uq_users_email` | — | Нормализованный email |
| `password_hash` | `varchar(255)` | нет | — | — | Argon2id hash |
| `role` | enum `user_role` | нет | — | — | `ADMIN`, `TEACHER`, `STUDENT` |
| `is_active` | `boolean` | нет | — | `true` | Разрешён ли вход/доступ |
| `email_verified_at` | `timestamptz` | да | — | — | Время подтверждения email; workflow пока не реализован |
| `created_at` | `timestamptz` | нет | — | `now()` | Создание |
| `updated_at` | `timestamptz` | нет | — | `now()` | Обновление ORM |

Check: `ck_users_email_normalized`: `email = lower(btrim(email))`.

## `profiles`

| Поле | Тип | NULL | PK/FK/Unique | Default | Назначение |
|---|---|---:|---|---|---|
| `user_id` | `uuid` | нет | PK; FK → `users.id` | — | 1:1 с User |
| `first_name` | `varchar(100)` | нет | — | — | Имя |
| `last_name` | `varchar(100)` | нет | — | — | Фамилия |
| `middle_name` | `varchar(100)` | да | — | — | Отчество |
| `bio` | `text` | да | — | — | Текст профиля |
| `timezone` | `varchar(64)` | нет | — | `Europe/Moscow` | IANA timezone |
| `created_at` | `timestamptz` | нет | — | `now()` | Создание |
| `updated_at` | `timestamptz` | нет | — | `now()` | Обновление ORM |

FK `fk_profiles_user_id_users` имеет `ON DELETE CASCADE`. Checks требуют trim/non-empty для обязательных имён, нормализованный optional `middle_name` и непустой `timezone`.

## `teacher_profiles`

| Поле | Тип | NULL | PK/FK/Unique | Default | Назначение |
|---|---|---:|---|---|---|
| `user_id` | `uuid` | нет | PK; FK → `users.id` | — | Доменная identity преподавателя |

FK `fk_teacher_profiles_user_id_users`: `ON DELETE CASCADE`.

## `student_profiles`

| Поле | Тип | NULL | PK/FK/Unique | Default | Назначение |
|---|---|---:|---|---|---|
| `user_id` | `uuid` | нет | PK; FK → `users.id` | — | Доменная identity ученика |

FK `fk_student_profiles_user_id_users`: `ON DELETE CASCADE`.

## `refresh_sessions`

| Поле | Тип | NULL | PK/FK/Unique | Default | Назначение |
|---|---|---:|---|---|---|
| `id` | `uuid` | нет | PK | UUID в приложении | Сессия/rotation record |
| `user_id` | `uuid` | нет | FK → `users.id` | — | Владелец |
| `token_hash` | `varchar(64)` | нет | Unique | — | HMAC-SHA256 refresh token |
| `family_id` | `uuid` | нет | index | UUID в приложении | Семейство rotation |
| `created_at` | `timestamptz` | нет | — | приложение | Создание token record |
| `last_used_at` | `timestamptz` | нет | — | приложение | Последнее использование/отзыв |
| `expires_at` | `timestamptz` | нет | index | приложение | Истечение |
| `revoked_at` | `timestamptz` | да | — | — | Отзыв/consumption |

FK `fk_refresh_sessions_user_id_users`: `ON DELETE CASCADE`. Unique `uq_refresh_sessions_token_hash`; check `ck_refresh_sessions_expiry` (`expires_at > created_at`). Индексы: `user_id`, `family_id`, `expires_at`.

## `teacher_student_relations`

| Поле | Тип | NULL | PK/FK/Unique | Default | Назначение |
|---|---|---:|---|---|---|
| `id` | `uuid` | нет | PK | UUID в приложении | Связь |
| `teacher_id` | `uuid` | нет | FK → `teacher_profiles.user_id`; pair unique; index | — | Преподаватель |
| `student_id` | `uuid` | нет | FK → `student_profiles.user_id`; pair unique; index | — | Ученик |
| `status` | enum `relation_status` | нет | composite indexes | приложение: `ACTIVE` | `ACTIVE`/`INACTIVE` |
| `teacher_note` | `text` | да | — | — | Приватная заметка преподавателя |
| `created_at` | `timestamptz` | нет | — | приложение | Создание связи |
| `deactivated_at` | `timestamptz` | да | — | — | Деактивация |

Оба FK имеют `ON DELETE CASCADE`. Unique `uq_teacher_student_relations_pair`. Checks: разные IDs; note ≤ 2000; `ACTIVE` требует `deactivated_at IS NULL`, `INACTIVE` — NOT NULL. Индексы `(teacher_id, status)` и `(student_id, status)`.

## `teacher_invitations`

| Поле | Тип | NULL | PK/FK/Unique | Default | Назначение |
|---|---|---:|---|---|---|
| `id` | `uuid` | нет | PK | UUID в приложении | Приглашение |
| `teacher_id` | `uuid` | нет | FK → `teacher_profiles.user_id`; index | — | Автор |
| `code_digest` | `varchar(64)` | нет | Unique | — | HMAC-SHA256 кода |
| `created_at` | `timestamptz` | нет | — | приложение | Создание |
| `expires_at` | `timestamptz` | нет | index | приложение | Истечение |
| `used_at` | `timestamptz` | да | — | — | Однократное использование |
| `used_by_student_id` | `uuid` | да | FK → `student_profiles.user_id` | — | Принявший ученик |
| `revoked_at` | `timestamptz` | да | — | — | Отзыв |

`teacher_id` использует `ON DELETE CASCADE`; `used_by_student_id` — `ON DELETE RESTRICT`. Unique `uq_teacher_invitations_code_digest`. Checks: expiry позже creation; `used_at` и `used_by_student_id` одновременно NULL либо одновременно заполнены. Индексы: `teacher_id`, `expires_at`.