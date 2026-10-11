# API-контракты Sprint 1

[К API](../conventions.md) · [Authentication](../authentication.md) · [Ошибки](../errors.md) · [BR](../../requirements/business-rules.md) · [Scope / AC](../../sprints/sprint-01/scope.md) · [Модель данных](../../architecture/data-model.md)

## Статус контракта

Этот документ фиксирует целевой HTTP-контракт Sprint 1. Наличие контракта не означает, что endpoint уже реализован.

Продуктовые Q-05, Q-07, Q-08, Q-09 и Q-10 разрешены в [бизнес-правилах](../../requirements/business-rules.md) и не являются активными блокерами этого контракта.

Неблокирующие implementation choices I-01–I-03 могут уточнять конкретные библиотеки, token implementation, local environment и tooling, но не меняют описанную здесь внешнюю семантику без согласованного изменения контракта.

Общие правила:

- все прикладные paths имеют префикс `/api/v1`;
- request / response JSON, UUID, HTTP policy и time semantics задаются [API conventions](../conventions.md);
- authentication / trusted context задаются [authentication](../authentication.md);
- все error responses используют [ErrorDTO](../errors.md);
- дополнительные body-поля запрещены;
- query parameters перечислены исчерпывающе;
- path parameters в операциях Sprint 1 ниже отсутствуют;
- client-side impersonation parameters не поддерживаются;
- API DTO не являются SQLAlchemy persistence models;
- response date-time возвращается в UTC с `Z`.

## Общие DTO

### Role

Допустимые значения:

```text
teacher | student
```

### AccountContextDTO

| Поле | Тип | Обязательность | Семантика |
| --- | --- | --- | --- |
| `account_id` | UUID | required, non-null | ID текущего / созданного Account |
| `role` | `"teacher" \| "student"` | required, non-null | Единственная роль Account |
| `profile` | object | required, non-null | Reference соответствующего доменного профиля |
| `profile.id` | UUID | required, non-null | Teacher ID при `role=teacher`, Student ID при `role=student` |
| `profile.display_name` | string | required, non-null | Человекочитаемая подпись профиля |

`profile.id` не равен `account_id` по смыслу и не вычисляется из него.

### TeacherRefDTO

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "display_name": "Анна Петрова"
}
```

Поля `id` и `display_name` обязательны и non-null.

### StudentRefDTO

```json
{
  "id": "22222222-2222-4222-8222-222222222222",
  "display_name": "Иван Соколов"
}
```

Поля `id` и `display_name` обязательны и non-null.

### TokenDTO

| Поле | Тип | Ограничение |
| --- | --- | --- |
| `access_token` | string | required, non-null, непустая opaque string |
| `token_type` | string | required, literal `"bearer"` |

### LessonCreateDTO

| Поле | Тип | Ограничение |
| --- | --- | --- |
| `student_id` | UUID | required, non-null |
| `starts_at` | timezone-aware ISO 8601 string | required, non-null |

`teacher_id` в request отсутствует. Текущий Teacher определяется Backend из authentication context.

### LessonDTO

Используется как результат создания Lesson:

| Поле | Тип | Ограничение |
| --- | --- | --- |
| `id` | UUID | required, non-null |
| `teacher_id` | UUID | required, non-null |
| `student_id` | UUID | required, non-null |
| `starts_at` | UTC ISO 8601 string | required, non-null |

### UpcomingLessonDTO

Используется в сценарии Student upcoming:

| Поле | Тип | Ограничение |
| --- | --- | --- |
| `id` | UUID | required, non-null |
| `starts_at` | UTC ISO 8601 string | required, non-null |
| `teacher` | TeacherRefDTO | required, non-null |

Текущий Student определяется из authentication context и не дублируется как выбираемый параметр.

### TeacherCalendarLessonDTO

Используется в календаре Teacher:

| Поле | Тип | Ограничение |
| --- | --- | --- |
| `id` | UUID | required, non-null |
| `starts_at` | UTC ISO 8601 string | required, non-null |
| `student` | StudentRefDTO | required, non-null |

Текущий Teacher определяется из authentication context.

Поля `duration`, `ends_at`, attendance, homework, Lesson status, price, recurrence и другие данные будущих инкрементов в DTO Sprint 1 не добавляются.

## Карта операций

| ID | Method / path | Роль | Связь |
| --- | --- | --- | --- |
| API-01 | POST `/api/v1/auth/register` | anonymous | F-06 |
| API-02 | POST `/api/v1/auth/login` | anonymous | F-06 |
| API-03 | GET `/api/v1/me` | authenticated Account | F-06 / F-08 |
| API-04 | GET `/api/v1/teachers/me/students` | Teacher | F-06 / US-01 |
| API-05 | POST `/api/v1/lessons` | Teacher | US-01 |
| API-06 | GET `/api/v1/students/me/lessons/upcoming` | Student | US-02 |
| API-07 | GET `/api/v1/teachers/me/lessons` | Teacher | US-03 |

Endpoints переноса, отмены, recurrence, attendance, homework, статистики, управления Teacher–Student relations и расширенного Account management в Sprint 1 отсутствуют.

# Foundation

## API-01 — Регистрация

**Method:** `POST`

**Path:** `/api/v1/auth/register`

**Authentication:** не требуется.

**Назначение:** атомарно создать Account и ровно один соответствующий Teacher / Student profile согласно BR-09 и BR-10.

### Request

Path parameters: отсутствуют.

Query parameters: отсутствуют.

JSON body:

| Поле | Тип | Ограничение |
| --- | --- | --- |
| `email` | string | required, non-null; trim + lowercase; корректный email; уникален после нормализации |
| `password` | string | required, non-null; длина 8–128; не trim-ится и не нормализуется |
| `role` | `"teacher" \| "student"` | required, non-null |
| `display_name` | string | required, non-null; trim; после trim непустой |

Дополнительные body-поля запрещены.

### Успех

HTTP `201`.

Response: `AccountContextDTO`.

Регистрация не выдаёт access token и не означает автоматический login. Для session используется API-02.

Пример:

```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "email": " Teacher@example.com ",
  "password": "example-password",
  "role": "teacher",
  "display_name": " Анна Петрова "
}
```

```json
{
  "account_id": "44444444-4444-4444-8444-444444444444",
  "role": "teacher",
  "profile": {
    "id": "11111111-1111-4111-8111-111111111111",
    "display_name": "Анна Петрова"
  }
}
```

### Проверки

- Account и profile создаются атомарно;
- email сохраняется после trim + lowercase;
- email verification не выполняется;
- password в открытом виде не сохраняется и не возвращается;
- роль определяет тип создаваемого profile;
- одновременно Teacher и Student profile для одного Account не создаются;
- `display_name` сохраняется после trim.

### Ошибки

| HTTP | `error.code` | Условие |
| ---: | --- | --- |
| `422` | `validation_error` | Некорректная schema, email, password length, role или `display_name` |
| `409` | `email_already_registered` | Нормализованный email уже занят |
| `500` | `internal_error` | Неожиданная server-side ошибка |

Применимые BR: BR-09, BR-10, BR-11.

---

## API-02 — Вход

**Method:** `POST`

**Path:** `/api/v1/auth/login`

**Authentication:** не требуется.

**Назначение:** проверить credentials Account и выдать opaque access token.

### Request

Path parameters: отсутствуют.

Query parameters: отсутствуют.

JSON body:

| Поле | Тип | Ограничение |
| --- | --- | --- |
| `email` | string | required, non-null; перед lookup применяется trim + lowercase; должен иметь корректный email format |
| `password` | string | required, non-null; перед проверкой не изменяется |

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "TEACHER@example.com",
  "password": "example-password"
}
```

### Успех

HTTP `200`.

Response: `TokenDTO`.

```json
{
  "access_token": "example-access-token",
  "token_type": "bearer"
}
```

Строка примера не является реальным credential.

### Ошибки

| HTTP | `error.code` | Условие |
| ---: | --- | --- |
| `422` | `validation_error` | Request schema или email format некорректны |
| `401` | `invalid_credentials` | Well-formed email не найден либо password неверен |
| `500` | `internal_error` | Неожиданная server-side ошибка |

Неизвестный Account и неверный password не различаются публичным ответом.

Token format, lifetime и Backend implementation определяются I-01 и остаются непрозрачными для Frontend.

---

## API-03 — Текущий контекст

**Method:** `GET`

**Path:** `/api/v1/me`

**Authentication:** Bearer.

**Роль:** любой аутентифицированный Account.

**Назначение:** вернуть доверенный Account / role / domain profile context для Frontend.

### Request

Path parameters: отсутствуют.

Query parameters: отсутствуют.

Body: отсутствует.

```http
GET /api/v1/me
Authorization: Bearer example-access-token
Accept: application/json
```

### Успех

HTTP `200`.

Response: `AccountContextDTO`.

Пример Teacher:

```json
{
  "account_id": "44444444-4444-4444-8444-444444444444",
  "role": "teacher",
  "profile": {
    "id": "11111111-1111-4111-8111-111111111111",
    "display_name": "Анна Петрова"
  }
}
```

Для `role=student` `profile.id` является Student ID.

### Ошибки

| HTTP | `error.code` | Условие |
| ---: | --- | --- |
| `401` | `authentication_required` | Bearer credential отсутствует, невалиден или истёк |
| `500` | `internal_error` | Неожиданная server-side ошибка, включая нарушение обязательного Account → matching profile invariant |

Client не передаёт Account / Teacher / Student ID для определения текущего context.

---

## API-04 — Доступные ученики

**Method:** `GET`

**Path:** `/api/v1/teachers/me/students`

**Authentication:** Bearer.

**Роль:** Teacher.

**Назначение:** вернуть Student, доступных текущему Teacher для создания Lesson.

### Request

Path parameters: отсутствуют.

Query parameters: отсутствуют.

Body: отсутствует.

### Успех

HTTP `200`.

Response: `StudentRefDTO[]`.

Пустой список:

```json
[]
```

Пример:

```json
[
  {
    "id": "22222222-2222-4222-8222-222222222222",
    "display_name": "Иван Соколов"
  }
]
```

В выборку входят только Student, для которых существует актуальная Teacher–Student relation с текущим Teacher.

Порядок элементов API-04 не имеет отдельной продуктовой семантики Sprint 1. Frontend не должен использовать позицию элемента как идентификатор или как правило доступа.

### Ошибки

| HTTP | `error.code` | Условие |
| ---: | --- | --- |
| `401` | `authentication_required` | Authentication отсутствует / невалидна |
| `403` | `forbidden` | Текущий Account не имеет роли Teacher |
| `500` | `internal_error` | Неожиданная server-side ошибка |

Применимые BR: BR-02, BR-09, BR-11.

Пользовательское создание / изменение Teacher–Student relations этим endpoint не добавляется.

# Расписание

## API-05 — Создать Lesson

**Method:** `POST`

**Path:** `/api/v1/lessons`

**Authentication:** Bearer.

**Роль:** Teacher.

**Назначение:** создать Lesson текущего Teacher для связанного Student.

### Request

Path parameters: отсутствуют.

Query parameters: отсутствуют.

Body: `LessonCreateDTO`.

```http
POST /api/v1/lessons
Authorization: Bearer example-access-token
Content-Type: application/json

{
  "student_id": "22222222-2222-4222-8222-222222222222",
  "starts_at": "2026-10-12T10:00:00+04:00"
}
```

### Authoritative validation

Backend в рамках одной управляемой операции:

1. определяет текущий Account / Teacher из Bearer credential;
2. валидирует `student_id` и timezone-aware `starts_at`;
3. фиксирует единое значение `now` для business validation;
4. проверяет `starts_at >= now`;
5. проверяет существование актуальной Teacher–Student relation;
6. создаёт один Lesson;
7. выполняет commit;
8. только после успешного commit возвращает success response.

`teacher_id` не принимается в request.

Пересечения расписания, длительность, повторяемость и максимальная будущая дата не проверяются в Sprint 1.

### Успех

HTTP `201`.

Response: `LessonDTO`.

```json
{
  "id": "33333333-3333-4333-8333-333333333333",
  "teacher_id": "11111111-1111-4111-8111-111111111111",
  "student_id": "22222222-2222-4222-8222-222222222222",
  "starts_at": "2026-10-12T06:00:00Z"
}
```

### Ошибки

| HTTP | `error.code` | Условие |
| ---: | --- | --- |
| `422` | `validation_error` | Request schema, UUID или date-time transport некорректны |
| `400` | `lesson_start_in_past` | Валидный `starts_at < now` |
| `401` | `authentication_required` | Authentication отсутствует / невалидна |
| `403` | `forbidden` | Текущий Account не имеет роли Teacher |
| `404` | `student_not_available` | Student отсутствует либо не связан с текущим Teacher |
| `500` | `internal_error` | Неожиданная server-side ошибка |

Любая отклонённая операция не создаёт Lesson.

Применимые BR: BR-01, BR-02, BR-03, BR-08, BR-09.

---

## API-06 — Предстоящие Lesson ученика

**Method:** `GET`

**Path:** `/api/v1/students/me/lessons/upcoming`

**Authentication:** Bearer.

**Роль:** Student.

**Назначение:** вернуть предстоящие Lesson текущего Student.

### Request

Path parameters: отсутствуют.

Query parameters: отсутствуют.

Body: отсутствует.

### Выборка

Backend фиксирует одно значение `now` на запрос и возвращает только Lesson:

```text
lesson.student_id = current_student.id
AND starts_at >= now
```

Порядок:

```text
starts_at ASC, id ASC
```

`starts_at == now` включается.

### Успех

HTTP `200`.

Response: `UpcomingLessonDTO[]`.

Пустой результат:

```json
[]
```

Пример при контролируемом `now = 2026-10-12T06:00:00Z`:

```json
[
  {
    "id": "33333333-3333-4333-8333-333333333333",
    "starts_at": "2026-10-12T06:00:00Z",
    "teacher": {
      "id": "11111111-1111-4111-8111-111111111111",
      "display_name": "Анна Петрова"
    }
  }
]
```

Teacher представлен `id + display_name`; UUID не используется как единственная UI-подпись.

### Ошибки

| HTTP | `error.code` | Условие |
| ---: | --- | --- |
| `401` | `authentication_required` | Authentication отсутствует / невалидна |
| `403` | `forbidden` | Текущий Account не имеет роли Student |
| `500` | `internal_error` | Неожиданная server-side ошибка |

Применимые BR: BR-04, BR-05, BR-06, BR-09, BR-11.

---

## API-07 — Lesson в календарном периоде Teacher

**Method:** `GET`

**Path:** `/api/v1/teachers/me/lessons`

**Authentication:** Bearer.

**Роль:** Teacher.

**Назначение:** вернуть Lesson текущего Teacher, попадающие в выбранный календарный диапазон.

### Request

Path parameters: отсутствуют.

Body: отсутствует.

Обязательные query parameters:

| Параметр | Тип | Ограничение |
| --- | --- | --- |
| `from` | timezone-aware ISO 8601 string | required, non-null |
| `to` | timezone-aware ISO 8601 string | required, non-null |

Date-only значения не принимаются вместо абсолютных date-time.

Frontend Sprint 1 формирует эти значения как границы выбранной локальной недели по BR-12. API при этом принимает абсолютные моменты и не требует передачи timezone name.

Пример для локальной недели `+04:00`:

```http
GET /api/v1/teachers/me/lessons?from=2026-10-05T00%3A00%3A00%2B04%3A00&to=2026-10-12T00%3A00%3A00%2B04%3A00
Authorization: Bearer example-access-token
Accept: application/json
```

Символ `+` в query должен быть URL-encoded как `%2B`; обычно это делает API client.

### Выборка

Для валидного диапазона обязательно:

```text
from < to
```

Backend возвращает только Lesson:

```text
lesson.teacher_id = current_teacher.id
AND from <= starts_at < to
```

Порядок:

```text
starts_at ASC, id ASC
```

### Успех

HTTP `200`.

Response: `TeacherCalendarLessonDTO[]`.

Пустой результат:

```json
[]
```

Пример:

```json
[
  {
    "id": "33333333-3333-4333-8333-333333333333",
    "starts_at": "2026-10-10T06:00:00Z",
    "student": {
      "id": "22222222-2222-4222-8222-222222222222",
      "display_name": "Иван Соколов"
    }
  }
]
```

Student представлен `id + display_name`; UUID не используется как единственная UI-подпись.

### Ошибки

| HTTP | `error.code` | Условие |
| ---: | --- | --- |
| `422` | `validation_error` | `from` / `to` отсутствуют либо имеют неверный date-time transport format |
| `400` | `invalid_date_range` | Оба момента валидны, но `from >= to` |
| `401` | `authentication_required` | Authentication отсутствует / невалидна |
| `403` | `forbidden` | Текущий Account не имеет роли Teacher |
| `500` | `internal_error` | Неожиданная server-side ошибка |

Применимые BR: BR-07, BR-09, BR-11, BR-12.

## Контрактные инварианты

Следующие правила обязательны для Backend и Frontend:

1. Account ID, Teacher ID и Student ID не взаимозаменяемы.
2. Текущий Teacher / Student всегда определяется Backend из authentication context.
3. `student_id` API-05 является целевым ресурсом, а не identity вызывающего пользователя.
4. Teacher–Student relation повторно проверяется при создании Lesson.
5. Временные значения на API-границе timezone-aware; responses возвращаются в UTC.
6. Frontend отображает время в локальной timezone браузера, но Backend работает с абсолютными моментами.
7. `display_name` передаётся там, где пользователь должен идентифицировать Teacher / Student.
8. Empty collection — `200 []`.
9. Error responses используют только общий ErrorDTO и зарегистрированные `error.code`.
10. Runtime OpenAPI и фактический HTTP должны соответствовать этому документу.

## Проверка совместимости и интеграции

Перед признанием соответствующей операции готовой сверить:

- method / path;
- authentication / role requirement;
- исчерпывающий request DTO;
- response DTO;
- HTTP status;
- error codes;
- UTC / timezone semantics;
- sorting;
- empty state;
- runtime OpenAPI;
- фактический HTTP Frontend ↔ Backend.

Для API-01 проверить atomic Account + profile creation и `409 email_already_registered`.

Для API-05 проверить rollback / отсутствие Lesson при rejected operation, включая `lesson_start_in_past` и `student_not_available`.

После успешного API-05 созданный Lesson должен попадать:

- в API-06, если он принадлежит текущему Student и `starts_at >= now`;
- в API-07, если он принадлежит текущему Teacher и `from <= starts_at < to`.

Для API-06 и API-07 использовать управляемое / замороженное `now` и fixtures на временных границах.

Contract mocks допустимы только для уже определённых DTO и не заменяют проверку реального HTTP.
