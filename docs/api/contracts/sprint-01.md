# API-контракты Sprint 1

[К API](../conventions.md) · [BR](../../requirements/business-rules.md) · [Scope / AC](../../sprints/sprint-01/scope.md)

## Статус и общие DTO

Пути и согласованные части ниже — целевой контракт реализации, endpoints сейчас не заявлены работающими. **Foundation auth заблокирован Q-07 / Q-08; представление участников — Q-09.** Пример согласованной части не делает весь контракт готовым. До разрешения блокера Backend / Frontend не фиксируют отсутствующие поля самостоятельно.

Общие соглашения: JSON, UUID, временная семантика и коды HTTP — [API](../conventions.md); ошибки и их DTO — [errors](../errors.md); identity / role context — [authentication](../authentication.md). Во всех операциях path-параметров нет. Дополнительные body-поля запрещены; query-параметры перечислены исчерпывающе, параметры impersonation не поддерживаются.

| DTO | Согласованные обязательные поля |
| --- | --- |
| AccountRefDTO | `id: UUID` |
| StudentRefDTO | `id: UUID`; это reference, не окончательное представление ученика в форме (Q-09) |
| LessonCreateDTO | `student_id: UUID`, `starts_at: timezone-aware ISO 8601 string`; оба non-null |
| LessonDTO | `id: UUID`, `teacher_id: UUID`, `student_id: UUID`, `starts_at: UTC ISO 8601 string`; все non-null |
| TokenDTO | `access_token: string` (непустой), `token_type: "bearer"` |
| ContextDTO | `account_id: UUID`; role / domain-reference часть не финализирована (Q-07) |

Поля длительности, посещаемости, домашних заданий и статусов не добавляются в LessonDTO. Teacher для US-02 пока представлен только reference `teacher_id`; окончательное человекочитаемое представление блокирует Q-09. Нельзя считать UUID утверждённой UX-подписью.

### Карта операций

| ID | Метод / путь | Связь | Готовность |
| --- | --- | --- | --- |
| API-01 | POST `/api/v1/auth/register` | F-06 | BLOCKED: Q-07, Q-08 |
| API-02 | POST `/api/v1/auth/login` | F-06 | BLOCKED: Q-08 |
| API-03 | GET `/api/v1/me` | F-06 / F-08 | BLOCKED: Q-07 |
| API-04 | GET `/api/v1/teachers/me/students` | F-06 / US-01 | Reference-граница определена; UI DTO — Q-09, auth prerequisite — Q-07 |
| API-05 | POST `/api/v1/lessons` | US-01 | DTO определён; политика даты — Q-05, auth prerequisite — Q-07 |
| API-06 | GET `/api/v1/students/me/lessons/upcoming` | US-02 | Выборка определена; Teacher display — Q-09, auth prerequisite — Q-07 |
| API-07 | GET `/api/v1/teachers/me/lessons` | US-03 | Выборка определена; auth prerequisite — Q-07 |

Не вводятся endpoints переноса, отмены, attendance, homework или статистики.

## Foundation

### API-01 — Регистрация

**Назначение:** создать Account в минимальном F-06. **Роль:** пользователь до входа. **Authentication:** не требуется. **Метод:** POST `/api/v1/auth/register`.

**Request:** path / query отсутствуют. Известная граница — JSON с `identifier: string` и `password: string`, обязательными non-null. `identifier` — техническое имя входного идентификатора, не решение использовать email / username. Тип идентификатора, нормализация / уникальность, ограничения пароля, роль и обязательные доменные данные — Q-07 / Q-08. Полный request DTO пока не определён.

**Успех:** 201 и AccountRefDTO; автоматический вход после регистрации не обещается, для token используется API-02. Создание доменных ресурсов зависит от Q-07.

**Валидация:** схема — 422; правила identifier / password задаются Q-08. Пароль хешируется, не возвращается. **Ошибки:** `validation_error` 422, `internal_error` 500; условия конфликта identifier и код 409 требуют Q-08. BR-01–BR-07 напрямую не применимы (Foundation, не сценарий Lesson).

**Пример согласованной части запроса — не финальный исполнимый контракт:**

```http
POST /api/v1/auth/register
Content-Type: application/json

{"identifier":"demo-teacher","password":"example-only-not-a-real-secret"}
```

Пример 201 response reference:

```json
{"id":"44444444-4444-4444-8444-444444444444"}
```

**Блокер:** PO должен решить Q-07 / Q-08; затем расширить полный DTO, ошибки и примеры. Не предполагать self-assigned Teacher role.

### API-02 — Вход

**Назначение:** получить token для защищённых операций F-06. **Роль:** пользователь до входа. **Authentication:** не требуется. **Метод:** POST `/api/v1/auth/login`.

**Request:** path / query нет; JSON `identifier: string`, `password: string`, обязательные non-null. Вход использует JSON, не скрытое form-urlencoded соглашение. Семантика identifier и ограничения — Q-08.

**Успех:** 200 TokenDTO. Токен непрозрачен, его срок жизни / стратегия — I-01. **Валидация:** схема 422; проверка credential Backend. **Ошибки:** 401 `invalid_credentials` без различия неизвестного пользователя и неверного пароля; 422 `validation_error`; 500 `internal_error`. BR Lesson напрямую не применимы.

Пример запроса согласованной структуры, identifier пока иллюстративен:

```http
POST /api/v1/auth/login
Content-Type: application/json

{"identifier":"demo-teacher","password":"example-only-not-a-real-secret"}
```

Пример ответа 200 (строка токена — вымышленная, не credential):

```json
{"access_token":"example-access-token","token_type":"bearer"}
```

**Блокер:** Q-08 до согласования полноценной формы входа и credential lookup. I-01 — технический выбор до реализации auth, не продуктовый блокер.

### API-03 — Текущий контекст

**Назначение:** дать UI доверенный текущий контекст для выбора сценариев. **Роль:** любой аутентифицированный Account. **Метод:** GET `/api/v1/me`; **Authentication:** Bearer.

**Request:** path / query / body нет. **Успех:** 200 ContextDTO; account_id определён, состав ролей и доменных references требует Q-07. **Валидация:** credential; не принимать ID текущего пользователя от клиента. **Ошибки:** 401 `authentication_required`, 500 `internal_error`. BR-01 / BR-04 / BR-07 используют получаемую сервером identity, но endpoint не возвращает чужие ресурсы.

```http
GET /api/v1/me
Authorization: Bearer example-access-token
Accept: application/json
```

Согласованная часть response 200, не полный ContextDTO:

```json
{"account_id":"44444444-4444-4444-8444-444444444444"}
```

**Блокер:** Q-07. Этот endpoint нужен UI, но получение текущего Teacher / Student внутри Backend не зависит от клиентского вызова `me`.

### API-04 — Доступные ученики

**Назначение:** источник выбора Student для формы US-01, F-06. **Роль:** Teacher. **Метод:** GET `/api/v1/teachers/me/students`; **Authentication:** Bearer.

**Request:** path / query / body нет. **Успех:** 200 StudentRefDTO[], пустой результат `[]`. **Валидация:** роль Teacher; выбирать только существующих Student со связью с текущим Teacher. **Ошибки:** 401 `authentication_required`, 403 `forbidden`, 500 `internal_error`. **BR:** [BR-02](../../requirements/business-rules.md#br-02--выбор-ученика). Сортировка отображаемых имён здесь не задана до Q-09.

```http
GET /api/v1/teachers/me/students
Authorization: Bearer example-access-token
Accept: application/json
```

Пример reference response 200:

```json
[{"id":"22222222-2222-4222-8222-222222222222"}]
```

**Граница / блокер:** reference DTO согласован; подписи списка и их поля — Q-09, доверенный auth/domain context — зависимость F-06 / Q-07. Пользовательское создание связей не добавляется; текущие тестовые связи готовятся demo data.

## Расписание

### API-05 — Создать Lesson

**Назначение:** [US-01](../../sprints/sprint-01/scope.md#us-01--создание-занятия). **Роль:** Teacher. **Метод:** POST `/api/v1/lessons`; **Authentication:** Bearer.

**Request:** path / query нет; LessonCreateDTO. Optional-полей нет. `teacher_id` не принимается: Teacher получается из контекста. **Успех:** 201 LessonDTO после успешного commit.

**Валидация:** обязательные поля, UUID и timezone string; существующий Student со связью с Teacher; атомарное сохранение. Не проверять пересечение расписания. Ограничение даты относительно настоящего не придумано — Q-05. **BR:** [BR-01](../../requirements/business-rules.md#br-01--автор-создания-занятия), [BR-02](../../requirements/business-rules.md#br-02--выбор-ученика), [BR-03](../../requirements/business-rules.md#br-03--данные-и-результат-создания).

**Ошибки:** 422 `validation_error`; 401 `authentication_required`; 403 `forbidden`; 404 `student_not_available`; 500 `internal_error`. Ошибка не возвращает созданный Lesson как успех. Код / условие отказа для прошлого времени добавляются только после Q-05.

```http
POST /api/v1/lessons
Authorization: Bearer example-access-token
Content-Type: application/json

{"student_id":"22222222-2222-4222-8222-222222222222","starts_at":"2026-10-10T10:00:00+04:00"}
```

Response 201:

```json
{
  "id":"33333333-3333-4333-8333-333333333333",
  "teacher_id":"11111111-1111-4111-8111-111111111111",
  "student_id":"22222222-2222-4222-8222-222222222222",
  "starts_at":"2026-10-10T06:00:00Z"
}
```

**Блокер:** Q-05 для полной бизнес-валидации; upstream F-06 / Q-07. Форма также зависит от Q-09 / Q-10. Request DTO не содержит длительность (минимум Sprint 1); расширение требует решения Q-04 / отдельного изменения.

### API-06 — Предстоящие Lesson ученика

**Назначение:** [US-02](../../sprints/sprint-01/scope.md#us-02--просмотр-предстоящих-занятий-учеником). **Роль:** Student. **Метод:** GET `/api/v1/students/me/lessons/upcoming`; **Authentication:** Bearer.

**Request:** path / query / body нет. **Успех:** 200 LessonDTO[], пустой `[]`. **Валидация:** контекст Student. Выборка и порядок определены [BR-04](../../requirements/business-rules.md#br-04--принадлежность-занятий-ученику), [BR-05](../../requirements/business-rules.md#br-05--предстоящие-занятия), [BR-06](../../requirements/business-rules.md#br-06--порядок-занятий): текущий Student, `starts_at >= now`, сортировка `starts_at ASC, id ASC`. `now` фиксируется Backend один раз на запрос.

**Ошибки:** 401 `authentication_required`, 403 `forbidden`, 500 `internal_error`. Прошедшие и чужие занятия не возвращаются.

```http
GET /api/v1/students/me/lessons/upcoming
Authorization: Bearer example-access-token
Accept: application/json
```

Response 200 при контролируемом `now = 2026-10-10T06:00:00Z` включает равную границу:

```json
[
  {
    "id":"33333333-3333-4333-8333-333333333333",
    "teacher_id":"11111111-1111-4111-8111-111111111111",
    "student_id":"22222222-2222-4222-8222-222222222222",
    "starts_at":"2026-10-10T06:00:00Z"
  }
]
```

**Граница / блокер:** выборка и минимальный DTO определены; Q-09 блокирует окончательный Teacher display DTO, Q-10 — отображение времени, F-06 / Q-07 — доверенный контекст. UI показывает loading / empty / error / success по scope, не придумывает имя Teacher из UUID.

### API-07 — Lesson в календарном периоде Teacher

**Назначение:** [US-03](../../sprints/sprint-01/scope.md#us-03--календарь-преподавателя). **Роль:** Teacher. **Метод:** GET `/api/v1/teachers/me/lessons`; **Authentication:** Bearer.

**Request:** body / path нет; query `from` и `to` — обязательные non-null timezone-aware ISO 8601 strings. Date-only не принимается. **Успех:** 200 LessonDTO[], пустой `[]`; `starts_at ASC, id ASC`.

**Валидация:** формат query 422; `from < to` 400; серверный Teacher context; выборка по [BR-07](../../requirements/business-rules.md#br-07--календарная-выборка), `from <= starts_at < to`. Максимальная длина периода не ограничивается без требования. **Ошибки:** 422 `validation_error`, 400 `invalid_date_range`, 401 `authentication_required`, 403 `forbidden`, 500 `internal_error`.

```http
GET /api/v1/teachers/me/lessons?from=2026-10-10T00%3A00%3A00Z&to=2026-10-11T00%3A00%3A00Z
Authorization: Bearer example-access-token
Accept: application/json
```

Response 200:

```json
[
  {
    "id":"33333333-3333-4333-8333-333333333333",
    "teacher_id":"11111111-1111-4111-8111-111111111111",
    "student_id":"22222222-2222-4222-8222-222222222222",
    "starts_at":"2026-10-10T06:00:00Z"
  }
]
```

При offset `+04:00` в query кодировать `+` как `%2B`; предпочтительно поручать кодирование API-client. Пример выше задаёт UTC-диапазон, не часовой пояс UI.

**Граница / блокер:** временной контракт завершён; F-06 / Q-07 остаётся upstream-зависимостью. Вид календаря / локальные границы UI — Q-10 и утверждённый дизайн L-04. В календаре нет переноса и отмены.

## Проверка совместимости

Для каждого endpoint сверить OpenAPI, DTO API-layer и фактический HTTP: код, схему, пустую выборку и ошибки. Для API-05 проверить отсутствие записи при rejected Student, а после успешного commit — попадание в API-06 / API-07 при подходящих границах. Граничные данные и замороженное время обязательны для BR-05 / BR-07. Полная приёмка blocked-операций проводится только после обновления контракта по решениям Q.
