# US-01 — Создание занятия: функциональная спецификация

[К справочнику](../../README.md) · [Scope Sprint 1](scope.md#us-01--создание-занятия) · [API-05](../../api/contracts/sprint-01.md#api-05--создать-lesson)

## 1. Назначение

**Задача:** US01-T01 — Функциональная спецификация и Acceptance Criteria.

**User Story:** «Как Teacher, я хочу создать занятие для связанного со мной Student, чтобы запланировать учебную встречу».

Документ консолидирует согласованное поведение US-01 для UX/UI, Frontend, Backend и QA. Это функциональное представление действующих требований, а не новый API-контракт или свидетельство готовой реализации. Канонические BR, API, Data Model, Error Model и Sprint scope сохраняют своё назначение; их источники перечислены в разделе 13.

Идентификаторы `US01-T01-AC-01`–`US01-T01-AC-17` обозначают детализированные критерии функциональной спецификации US01-T01. Они детализируют сводный `AC-01` US-01 из Sprint scope и не переименовывают его или критерии других User Stories.

## 2. Scope

Сценарий включает получение доступных Student, выбор одного Student, ввод начала занятия, отправку запроса, серверную проверку, атомарное создание одного Lesson и обработку результата в UI.

Используются только существующие операции:

| Операция | Назначение |
| --- | --- |
| `GET /api/v1/teachers/me/students` — API-04 | Получить Student, связанных с текущим Teacher |
| `POST /api/v1/lessons` — API-05 | Создать Lesson текущего Teacher |

Регистрация, вход и получение текущего контекста — зависимости Foundation, а не дополнительные действия US-01. Границы исключений приведены в разделе 11.

## 3. Участники и предусловия

- Actor — аутентифицированный User с ролью `teacher` и соответствующим TeacherProfile согласно BR-09.
- Backend проверяет Bearer credential и получает доверенный контекст `User → Profile → TeacherProfile`. Текущий Teacher определяется для защищённого запроса независимо от того, вызывал ли Frontend `/me`.
- Frontend не передаёт `teacher_id` для определения автора Lesson. Teacher не может создавать Lesson от имени другого Teacher.
- Для успешного создания существует StudentProfile, связанный с текущим Teacher актуальной Teacher–Student relation.
- Frontend использует API-layer для запросов. Отображение роли или скрытие элемента UI не заменяет серверную авторизацию.

Отсутствующая / невалидная authentication даёт `401 authentication_required`; роль, отличная от `teacher`, — `403 forbidden`. Нарушение обязательного Profile / role-profile invariant у валидного User является серверной ошибкой `500 internal_error`, а не ошибкой роли.

## 4. Входные данные

### Список для выбора Student

Frontend получает `StudentRefDTO[]` через [API-04](../../api/contracts/sprint-01.md#api-04--доступные-ученики). В ответ входят только Student, связанные с текущим Teacher. Успешный пустой результат — `200 []`.

Для каждого Student ответ содержит ролевой `id`, обязательные `first_name`, `last_name` и nullable `middle_name`. Frontend формирует человекочитаемое имя из этих полей; `middle_name = null` не отображается как часть имени. UUID не используется как пользовательская подпись. Конкретный порядок частей имени и оформление выбора здесь не задаются.

Выбранное значение — `StudentProfile.id`, а не User ID или общий `Profile.id`.

### Запрос создания

`LessonCreateDTO` содержит только два обязательных non-null поля:

| Поле | Формат и значение |
| --- | --- |
| `student_id` | UUID выбранного Student; соответствует `StudentProfile.id` |
| `starts_at` | Timezone-aware ISO 8601; абсолютный момент начала |

Пользователь вводит локальные дату и время. Frontend интерпретирует их в timezone браузера и преобразует в transport value с явным offset или `Z`. Локализованная подпись UI и timezone-naive строка не являются значением для API.

Пример запроса с синтетическим Student ID:

```http
POST /api/v1/lessons
Authorization: Bearer example-access-token
Content-Type: application/json

{
  "student_id": "22222222-2222-4222-8222-222222222222",
  "starts_at": "2026-10-16T10:00:00+04:00"
}
```

Для успешного примера Student должен быть связан с текущим Teacher, а серверный `now` — не позже указанного начала. Offset в примере не устанавливает общую timezone продукта.

Path / query parameters отсутствуют. `teacher_id` и другие необъявленные body-поля не принимаются согласно действующему контракту.

## 5. Основной пользовательский flow

1. Teacher открывает сценарий создания Lesson.
2. Frontend переводит загрузку списка Student в loading state и вызывает API-04.
3. При `200` отображаются доступные Student; `[]` означает корректный empty state без доступного выбора. Ошибка загрузки отображается как error state, а не как пустой успешный список.
4. Teacher выбирает связанного Student по человекочитаемому имени.
5. Teacher вводит локальные дату и время начала.
6. Frontend преобразует ввод в timezone-aware transport value и формирует LessonCreateDTO.
7. При подтверждении Frontend переходит в submitting state и отправляет один запрос API-05. Повторный submit до результата блокируется на уровне UI.
8. Backend выполняет authoritative validation и атомарное сохранение по разделу 6.
9. При успехе Backend возвращает `201 LessonDTO`; Frontend получает созданный Lesson и подтверждает успешное создание.
10. При ошибке Frontend показывает понятный error state. Сохранение или очистка введённых значений определяется UX-решениями F-07 и здесь не фиксируется.

Loading / empty / error / success являются функциональными состояниями. Конкретные layout, подписи кнопок, modal / page / drawer, toast / inline alert и redirect после успеха определяются F-07 / UX specification и этим документом не фиксируются.

## 6. Правила валидации

### Authoritative Backend validation

Backend в рамках одной управляемой операции должен:

1. Определить текущего User / Teacher из Bearer credential и проверить допустимость роли.
2. Валидировать request schema: обязательность, типы и отсутствие дополнительных body-полей.
3. Проверить UUID `student_id`.
4. Проверить timezone-aware ISO 8601 `starts_at`.
5. Зафиксировать единое значение `now` для бизнес-проверок операции.
6. Сравнить абсолютные моменты и проверить `starts_at >= now`.
7. Повторно проверить существование Student и актуальной Teacher–Student relation с текущим Teacher.
8. Создать ровно один Lesson с текущим `TeacherProfile.id`, выбранным `StudentProfile.id` и переданным абсолютным моментом начала.
9. Выполнить commit.
10. Только после успешного commit вернуть success response.

Получение Student в списке ранее не заменяет повторную проверку relation. Если связь перестала существовать между API-04 и API-05, создание отклоняется. Frontend validation улучшает UX, но не заменяет ни одну из серверных проверок.

### Границы времени

| Условие относительно единого серверного `now` | Результат при выполнении остальных условий |
| --- | --- |
| `starts_at < now` | Отказ: `400 lesson_start_in_past` |
| `starts_at == now` | Создание разрешено |
| `starts_at > now` | Создание разрешено |

Максимальная будущая дата в Sprint 1 не ограничивается отдельным продуктовым правилом. Формат значения должен оставаться допустимым по действующему API-контракту. Время браузера не определяет серверный `now`; одинаковые абсолютные моменты с разными offsets сравниваются одинаково.

Для проверки точного равенства QA использует управляемое / замороженное серверное время, а не пытается попасть в текущий момент ручным submit.

### Атомарность

Если validation, authorization или business rule отклоняет операцию до сохранения, Lesson не создаётся. Если ошибка произошла до успешного commit либо сам commit не завершился успешно, новый Lesson не сохраняется; частично созданный Lesson недопустим, операция откатывается. Success response нельзя возвращать до успешного commit.

После успешного commit дальнейшая ошибка формирования response, в том числе response validation / serialization failure, может привести к `500 internal_error`. Такой ответ не гарантирует отсутствия Lesson в persistence и не отменяет уже успешный commit. При неопределённом результате Frontend не должен автоматически повторять create request без отдельной гарантии безопасной идемпотентности / подтверждения фактического состояния.

«Ровно один Lesson» относится к одной успешной операции. UX-защита повторного submit не является обещанием серверной идемпотентности нескольких отдельных запросов; такой контракт не вводится.

## 7. Позитивный сценарий

Предусловия: валидная authentication Teacher, связанный Student и валидное начало не раньше зафиксированного Backend `now`.

Teacher проходит flow раздела 5: открывает сценарий → получает Student → выбирает Student → вводит дату/время → подтверждает создание. Frontend отправляет преобразованный абсолютный момент; Backend проверяет данные и актуальную relation, сохраняет один Lesson и выполняет commit.

Успешный ответ — HTTP `201`, тело — существующий `LessonDTO`:

| Поле ответа | Требуемая семантика |
| --- | --- |
| `id` | UUID созданного Lesson |
| `teacher_id` | `TeacherProfile.id` текущего аутентифицированного Teacher |
| `student_id` | `StudentProfile.id` выбранного связанного Student |
| `starts_at` | Тот же абсолютный момент начала, возвращённый в UTC с `Z` |

Например, `2026-10-16T10:00:00+04:00` возвращается как `2026-10-16T06:00:00Z`, без сдвига абсолютного момента. Frontend переводит UI в успешное состояние и обновляет затронутые данные по авторитетному Backend-состоянию согласно архитектуре Frontend.

## 8. Негативные сценарии

Каждая строка рассматривается при выполнении остальных предусловий, чтобы результат проверки был однозначен. Отклонение validation / authorization / business rule до сохранения не создаёт Lesson; ошибка до успешного commit также не оставляет нового или частичного Lesson. Для `500 internal_error` после успешного commit отсутствие Lesson не гарантируется — применяется раздел «Атомарность».

| Условие | HTTP / `error.code` | `details[].code` и поле, где применимо |
| --- | --- | --- |
| Нет `student_id` | `422 validation_error` | `required`, `location: ["body", "student_id"]` |
| Нет `starts_at` | `422 validation_error` | `required`, `location: ["body", "starts_at"]` |
| Невалидный UUID `student_id` | `422 validation_error` | `invalid_uuid`, `location: ["body", "student_id"]` |
| Некорректный формат `starts_at` | `422 validation_error` | `invalid_datetime`, `location: ["body", "starts_at"]` |
| В `starts_at` отсутствует timezone | `422 validation_error` | `invalid_datetime`, `location: ["body", "starts_at"]` |
| Валидный `starts_at < now` | `400 lesson_start_in_past` | По действующей Error Model |
| Student не существует | `404 student_not_available` | Тот же публичный ответ, что для несвязанного Student |
| Student существует, но relation с текущим Teacher отсутствует | `404 student_not_available` | Тот же публичный ответ, что для отсутствующего Student |
| Relation перестала существовать после загрузки списка | `404 student_not_available` | Результат повторной проверки при создании |
| Нет authentication, Bearer credential невалиден или истёк | `401 authentication_required` | По authentication contract |
| Аутентифицированный User имеет роль `student`, а не `teacher` | `403 forbidden` | По authentication contract |
| Передан `teacher_id` или другое необъявленное body-поле | `422 validation_error` | `unexpected_field`, location переданного поля |
| Неожиданная server-side ошибка | `500 internal_error` | `details: []`, без внутренней диагностики; состояние persistence зависит от того, был ли commit успешным |

Первые две строки относятся к отсутствующему полю; явный `null` также не соответствует non-null schema и не допускает создание. Его mapping определяется общей Error Model, отдельный код здесь не вводится.

Несуществующий Student и существующий несвязанный Student — разные проверки QA, но одинаковый публичный API response. Backend не раскрывает через эти ответы существование чужого Student.

## 9. Error behavior

Все Backend errors используют существующий [ErrorDTO](../../api/errors.md#errordto): обязательный объект `error` с `code`, `message` и массивом `details`. Структура и семантика определяются канонической Error Model; DTO здесь не переопределяется.

Frontend принимает решения по HTTP status и стабильному `error.code`, а field errors связывает с полями через `details[].location`. Тексты `message` и `details[].message` не являются условиями программного ветвления и не фиксируются здесь как точные пользовательские тексты.

- Исправимая ошибка формы / бизнес-проверки показывает понятный error state.
- `401 authentication_required` прекращает использование недействительной локальной сессии и переводит пользователя к повторной authentication по действующему контракту.
- `403 forbidden` отображается как запрет операции и не запускает повторный login автоматически.
- `500 internal_error` не раскрывает SQL, stack trace, credential и внутренние данные. Он может возникнуть после успешного commit при response validation / serialization failure и сам по себе не подтверждает отсутствие Lesson. После неопределённого результата Frontend не повторяет create request автоматически без гарантии безопасной идемпотентности / подтверждения фактического состояния.
- Сетевой сбой, timeout, non-JSON response и несовместимый response DTO — transport / compatibility failure API-layer, а не выдуманный Backend ErrorDTO. Потеря ответа сама по себе не доказывает, что Backend отклонил создание; автоматическая безопасная повторная отправка не предполагается без контракта идемпотентности.

При загрузке Student ошибка отличается от `200 []`; при отправке формы предусмотрен контролируемый submitting state. Подтверждение успешного создания показывается при получении согласованного success response, без закрепления конкретного визуального решения.

## 10. Acceptance Criteria

### US01-T01-AC-01 — Доступ к сценарию

**Given:** User аутентифицирован и имеет роль `teacher`. **When:** он использует сценарий создания Lesson. **Then:** может создать Lesson только от имени текущего Teacher; роль `student` получает `403 forbidden`, запрос без действующей authentication — `401 authentication_required`.

### US01-T01-AC-02 — Список Student

**Given:** текущий User — Teacher. **When:** Frontend получает API-04. **Then:** список содержит только связанных Student; выбор выполняется по имени из `first_name`, `last_name`, nullable `middle_name`, без UUID в качестве пользовательской подписи. `200 []` отображается как empty state, ошибка запроса — как error state.

### US01-T01-AC-03 — Успешное создание

**Given:** выбран связанный Student и указан валидный `starts_at >= now`. **When:** Teacher подтверждает создание. **Then:** одна успешная операция создаёт ровно один Lesson текущего Teacher с выбранным Student и переданным абсолютным моментом начала.

### US01-T01-AC-04 — Trusted Teacher context

**Given:** Teacher формирует запрос. **When:** Frontend отправляет LessonCreateDTO. **Then:** body содержит только `student_id` и `starts_at`; Backend определяет автора из authentication context. Переданный дополнительно `teacher_id` не подменяет автора и отклоняется как `422 validation_error` с detail `unexpected_field`.

### US01-T01-AC-05 — Обязательные данные

**Given:** в остальном корректный запрос без `student_id` либо без `starts_at`. **When:** Backend проверяет request schema. **Then:** возвращает `422 validation_error`, detail `required` с location отсутствующего поля; Lesson не создаётся.

### US01-T01-AC-06 — Student availability

**Given:** Student не существует либо существует без актуальной связи с текущим Teacher, в том числе после её изменения с момента API-04. **When:** выполняется создание. **Then:** Backend повторно проверяет доступность, возвращает одинаковый публичный `404 student_not_available` для обоих условий и не создаёт Lesson.

### US01-T01-AC-07 — Date-time validation

**Given:** `starts_at` имеет некорректный формат либо не содержит timezone. **When:** Backend валидирует запрос. **Then:** возвращает `422 validation_error`, detail `invalid_datetime` с location `starts_at`; Lesson не создаётся.

### US01-T01-AC-08 — Past start и единый now

**Given:** контролируемый серверный `now`. **When:** отдельно проверяются валидные `starts_at < now`, `starts_at == now` и `starts_at > now`. **Then:** первый запрос получает `400 lesson_start_in_past` без сохранения, два остальных допускаются при выполнении других условий. Backend использует один `now` внутри операции; отдельный максимум будущей даты не вводится.

### US01-T01-AC-09 — Atomicity

**Given:** validation / authorization / business rule отклоняет операцию до сохранения либо возникает ошибка до успешного commit / сам commit не завершается успешно. **When:** Backend завершает эту отклонённую операцию. **Then:** новый или частично созданный Lesson отсутствует в persistence; success response не возвращается до успешного commit. Проверка выполняется по состоянию хранения, а не только по HTTP-коду. К ошибке формирования response после успешного commit применяется US01-T01-AC-17.

### US01-T01-AC-10 — Successful response

**Given:** проверки пройдены и commit успешен. **When:** Backend возвращает результат. **Then:** это `201 LessonDTO` с `id`, `teacher_id = TeacherProfile.id` текущего Teacher, `student_id = StudentProfile.id` выбранного Student и `starts_at` в UTC с `Z`.

### US01-T01-AC-11 — Schedule conflicts are out of scope

**Given:** остальные условия создания выполнены и существует другой Lesson в тот же или потенциально пересекающийся момент. **When:** Teacher создаёт Lesson. **Then:** US-01 не проверяет пересечение и не отклоняет создание по этой причине; обнаружение и предупреждение относятся к US-04.

### US01-T01-AC-12 — Scope boundary

**Given:** реализация US-01. **When:** проверяются её интерфейс, request / response и результат. **Then:** она не вводит conflict checking, duration, `ends_at`, перенос, отмену, recurrence, attendance, homework или Lesson status lifecycle; поля Lesson остаются в границах Sprint 1 contract.

### US01-T01-AC-13 — Формат Student ID

**Given:** строка `student_id` не является допустимым UUID. **When:** Backend валидирует запрос. **Then:** возвращает `422 validation_error`, detail `invalid_uuid` с location `student_id`; Lesson не создаётся. Валидный UUID проверяется как `StudentProfile.id`, а не User ID / общий Profile ID.

### US01-T01-AC-14 — Время на границе Frontend / Backend

**Given:** локальные дата и время введены в timezone браузера. **When:** Frontend отправляет запрос и получает успех. **Then:** transport содержит offset или `Z`, Backend сохраняет тот же абсолютный момент и возвращает UTC; эквивалентные timestamps с разными offsets не меняют смысл начала.

### US01-T01-AC-15 — Submitting state

**Given:** форма заполнена. **When:** create request уже отправлен и результат ещё не получен. **Then:** UI находится в контролируемом submitting state и не инициирует второй одинаковый create request из-за случайного повторного submit.

При success отображается успешное состояние, при error — error state. Конкретное сохранение / очистка введённых значений после ошибки, а также modal / toast / redirect этой спецификацией не фиксируются и относятся к UX-решениям F-07.

### US01-T01-AC-16 — Единая ошибка

**Given:** Backend отклоняет запрос. **When:** Frontend обрабатывает response. **Then:** использует HTTP status, стабильный `error.code` и field locations из ErrorDTO; изменение текста `message` не меняет программное поведение. Отсутствующий и несвязанный Student не различаются публичным response.

### US01-T01-AC-17 — Неожиданная серверная ошибка

**Given:** при обработке создания возникает непредусмотренная server-side ошибка. **When:** Backend формирует error response. **Then:** публично возвращается `500 internal_error` с `details: []` без раскрытия внутренней диагностики; Frontend показывает error state. Нарушенный обязательный role-profile invariant также обрабатывается как `500`, а не `403`.

Если ошибка произошла до успешного commit либо сам commit не завершился успешно, новый Lesson не сохраняется. После уже успешного commit последующая response validation / serialization failure не означает автоматически, что Lesson отсутствует в БД; такой гарантии для любого `500` спецификация не даёт.

Frontend не должен автоматически повторять create request после неопределённого результата без отдельной гарантии безопасной идемпотентности / подтверждения фактического состояния.

## 11. Out of scope

- Проверка пересечений расписания и предупреждение Teacher — US-04.
- Duration и `ends_at`.
- Перенос и отмена Lesson.
- Recurrence.
- Attendance.
- Homework.
- Lesson status и расширенная логика lifecycle.
- Любые поля Lesson вне действующего Sprint 1 API contract.
- Пользовательское создание, изменение или удаление Teacher–Student relation.
- Конкретная визуальная реализация сценария и успеха до соответствующей UX specification.

## 12. Связи и зависимости

### Foundation и реализация

- **F-06:** User, Profile, TeacherProfile / StudentProfile, Bearer authentication, доверенный контекст и существующие Teacher–Student relations.
- **F-07:** UX/UI сценария и визуальная реализация состояний; функциональные требования этого документа не выбирают layout или компоненты.
- **F-08:** реальный HTTP-обмен Frontend ↔ Backend по существующим API-04 / API-05, DTO и Error Model.
- **Backend / Frontend / QA:** используют AC этого документа вместе с каноническими BR и контрактами; наличие спецификации не заменяет реализацию, интеграционную проверку или Product Acceptance.

### US-04 — Проверка пересечений занятий

Связь с US-04 задана в постановке US01-T01:

> Я как преподаватель хочу получать предупреждение о пересечении создаваемого занятия с другим занятием, чтобы избежать конфликтов в расписании.

Наличие другого Lesson в тот же или пересекающийся момент само по себе не является основанием отказа в US-01. Обнаружение пересечения и предупреждение Teacher относятся к US-04; алгоритм, новые поля, DTO, endpoints и error codes для этого здесь не определяются. US-04 не включается этим документом в scope Sprint 1. Базовый create flow и готовность US-01 не зависят от реализации US-04.

### US-02 / US-03

Успешно созданный Lesson является входными данными для US-02 и US-03:

- В US-02 он может появиться в upcoming-выборке только при выполнении собственных правил US-02: принадлежность текущему Student и `starts_at >= now` по BR-04 / BR-05.
- В US-03 он может появиться в календарной выборке только при выполнении собственных правил US-03: принадлежность текущему Teacher и `from <= starts_at < to` по BR-07.

Логика отображения, фильтрации и Acceptance Criteria US-02 / US-03 не входят в scope US-01. Это связь данных между историями, а не критерий приёмки создания Lesson: готовность US-01 не зависит от готовности US-02 / US-03.

### Изменения и открытые вопросы

Изменение BR, API contract, модели данных, ошибок, authentication или Sprint scope требует [Change Management](../../process/change-management.md); эта задача их не переопределяет. При обнаружении противоречия его необходимо зафиксировать и согласовать, а не исправлять канонический источник молча.

Противоречий канонических требований US-01, блокирующих эту спецификацию, не выявлено. Новых продуктовых решений для завершения US01-T01 не требуется. Визуальные решения F-07 остаются отдельной задачей; их отсутствие не подменяется предположениями здесь.

## 13. Источники требований

| Источник | Что использовано |
| --- | --- |
| [Sprint 1 scope — US-01](scope.md#us-01--создание-занятия) | Actor, основной сценарий, сводный AC-01, границы US и связь с US-02 / US-03 |
| [Business Rules](../../requirements/business-rules.md) | BR-01–BR-03: автор, доступность Student, атомарный результат; BR-08: время начала; BR-09: роль / контекст; BR-11: имя; BR-12: timezone браузера; BR-04 / BR-05 / BR-07: связанные выборки |
| [API contracts Sprint 1](../../api/contracts/sprint-01.md) | API-04 / API-05, StudentRefDTO, LessonCreateDTO, LessonDTO, HTTP-коды, повторная проверка relation и commit до success |
| [Error Model](../../api/errors.md) | Общий ErrorDTO, зарегистрированные error / detail codes, безопасные ошибки и граница transport failures |
| [Authentication](../../api/authentication.md) | Bearer transport, доверенный User / role-profile context, различие 401 / 403 и server-side invariant failure |
| [Data Model](../../architecture/data-model.md) | TeacherProfile.id / StudentProfile.id, связи Lesson, starts_at и отсутствие полей будущего scope |
| [Integration](../../architecture/integration.md) | API-layer, timezone-aware обмен, человекочитаемые имена и обработка ошибок |
| [API conventions](../../api/conventions.md) | Исчерпывающий request body, формат даты/времени и UTC response |
| [Frontend architecture](../../architecture/frontend.md#состояния-ошибки-и-тестирование) | UI-состояния, блокировка повторного submit и отсутствие обещания серверной идемпотентности |
| Постановка US01-T01 | Структура консолидации и явная граница с US-04 |
