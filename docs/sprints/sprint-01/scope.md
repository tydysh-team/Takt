# Sprint 1: объём работ

[К документации](../../README.md) · [Бизнес-правила](../../requirements/business-rules.md) · [API-контракты](../../api/contracts/sprint-01.md) · [DoR / DoD](../../process/definition-of-ready-done.md) · [Change Management](../../process/change-management.md)

## Общая информация

| Параметр | Значение |
| --- | --- |
| Продукт | Takt |
| Период | 03.10.2026–17.10.2026 |
| Продолжительность | 2 недели |
| Общий объём | 93 SP |
| Состав | F-01–F-08, US-01–US-03 |

`93 SP` — общий объём Sprint 1.

Оценки отдельных Technical Tasks, owner / reviewer, зависимости и фактические статусы ведутся в Sprint Planning / Kaiten и не дублируются в этом документе.

Этот файл фиксирует **согласованный продуктовый и технический scope Sprint 1**, а не текущий процент реализации.

## Sprint Goal

> Создать техническую основу Takt и реализовать первый сквозной сценарий работы с расписанием: преподаватель создаёт занятие, а информация о запланированных занятиях становится доступна пользователям через интерфейс платформы.

Sprint Goal считается достигнутым только при совместной работе Foundation и пользовательских сценариев, а не при наличии изолированных Backend / Frontend заготовок.

# Foundation

| ID | Задача | Ожидаемый результат Sprint 1 |
| --- | --- | --- |
| F-01 | Базовая проектная и функциональная документация | `/docs` содержит согласованный справочник по продукту, требованиям, архитектуре, API, процессу, QA, шаблонам и scope спринта. |
| F-02 | Структура репозитория и workflow разработки | Определены структура repository и согласованный процесс совместной разработки через отдельные ветки, PR, review и task workflow. |
| F-03 | Инициализация Backend | Создана основа Backend на Python 3.12 / FastAPI с согласованными слоями, `/api/v1`, базовой обработкой ошибок, health check и pytest setup. |
| F-04 | Инициализация Frontend | Создана основа Frontend на React + TypeScript с routing, layout, environment config и централизованным API-layer. |
| F-05 | PostgreSQL / SQLAlchemy / Alembic / локальное окружение | Подготовлены persistence layer, PostgreSQL, миграции и локальный запуск через Docker / Docker Compose. |
| F-06 | Account / Teacher / Student / authentication / demo data | Реализованы Account, роли `teacher` / `student`, соответствующие profiles, Teacher–Student relation, регистрация, login, `/me` и demo data для сценариев спринта. |
| F-07 | UI/UX base | Подготовлена UI/UX-основа пользовательских сценариев Sprint 1 и необходимые состояния интерфейса. |
| F-08 | Frontend ↔ Backend integration | Frontend и Backend работают через согласованные API contracts; проверены реальный HTTP exchange, auth context, DTO, errors и базовый integration smoke. |

Таблица описывает ожидаемый результат Foundation, а не текущий статус карточек.

## Foundation boundaries

### F-06 — Account / authentication

Для Sprint 1 действует следующий минимум:

- каждый Account имеет ровно одну роль: `teacher` либо `student`;
- Account связан ровно с одним соответствующим Teacher или Student profile;
- роль выбирается при регистрации;
- multi-role и смена роли не входят в Sprint 1;
- регистрация использует `email`, `password`, `role`, `display_name`;
- email нормализуется через trim + lowercase и является login identifier;
- password имеет длину `8–128`, не trim-ится и не нормализуется;
- password хранится только как hash;
- Account + matching profile создаются атомарно;
- `/me` возвращает доверенный Account / role / profile context;
- demo data содержит данные, достаточные для Teacher–Student и Lesson scenarios Sprint 1.

Подтверждение email, password recovery / reset, refresh token, server-side logout / revocation и расширенное Account management в Sprint 1 не входят.

### F-08 — Integration

Mocks допустимы для разработки, но не считаются доказательством готовой интеграции.

Для готового Sprint 1 требуется реальный Frontend ↔ Backend exchange по утверждённым contracts, включая:

- `/api/v1`;
- Bearer authentication;
- trusted server-side identity;
- success DTO;
- ErrorDTO;
- человекочитаемые `display_name`;
- timezone-aware date-time;
- empty / error / success behavior.

# US-01 — Создание занятия

## User Story

Как Teacher, я хочу создать занятие для связанного со мной Student, чтобы запланировать учебную встречу.

## Предусловия

- Teacher аутентифицирован.
- В системе существует Student, связанный с текущим Teacher.
- Frontend может получить доступных Student через API-04.
- Пользователь выбирает Student по человекочитаемому `display_name`, а не только по UUID.

## Минимальный сценарий

1. Backend определяет текущего Teacher из authentication context.
2. Frontend получает список Student, связанных с текущим Teacher.
3. Teacher выбирает Student.
4. Teacher задаёт локальные дату и время начала занятия.
5. Frontend интерпретирует значение в timezone браузера и отправляет timezone-aware ISO 8601 `starts_at`.
6. Backend валидирует request.
7. Backend фиксирует одно значение `now` для операции и проверяет `starts_at >= now`.
8. Backend повторно проверяет существование Teacher–Student relation.
9. Backend атомарно сохраняет Lesson.
10. Frontend получает результат либо проектную ошибку и отображает соответствующее состояние.

## Acceptance Criteria — AC-01

Корректный запрос создаёт ровно один Lesson:

- для текущего аутентифицированного Teacher;
- для выбранного связанного Student;
- с переданным допустимым `starts_at`.

Создание отклоняется, если:

- отсутствует действующая authentication;
- текущая роль не `teacher`;
- `student_id` невалиден;
- Student не существует;
- Student существует, но не связан с текущим Teacher;
- date-time имеет некорректный transport format / не содержит timezone;
- `starts_at < now`.

`starts_at == now` допускается.

Отклонённая операция не создаёт частичный Lesson.

После успешного создания Lesson доступен:

- Student через US-02, если выполняются правила upcoming;
- Teacher через US-03, если Lesson попадает в выбранный календарный диапазон.

## Scope US-01

В Lesson Sprint 1 входят только:

- Teacher;
- Student;
- `starts_at`.

Не входят:

- duration / `ends_at`;
- проверка пересечений расписания;
- перенос;
- отмена;
- recurrence;
- attendance;
- homework;
- Lesson status.

**Business Rules:** [BR-01](../../requirements/business-rules.md#br-01--автор-создания-занятия), [BR-02](../../requirements/business-rules.md#br-02--выбор-ученика), [BR-03](../../requirements/business-rules.md#br-03--данные-и-результат-создания), [BR-08](../../requirements/business-rules.md#br-08--допустимый-момент-начала-при-создании-lesson), [BR-09](../../requirements/business-rules.md#br-09--роль-account-и-доменный-контекст), [BR-11](../../requirements/business-rules.md#br-11--человекочитаемое-представление-участника).

**API:** [API-04](../../api/contracts/sprint-01.md#api-04--доступные-ученики), [API-05](../../api/contracts/sprint-01.md#api-05--создать-lesson).

# US-02 — Просмотр предстоящих занятий учеником

## User Story

Как Student, я хочу видеть свои предстоящие занятия, чтобы знать время встречи и преподавателя.

## Минимальный сценарий

1. Backend определяет текущего Student из authentication context.
2. Backend фиксирует одно значение `now` для операции.
3. Выбираются только Lesson текущего Student с:

```text
starts_at >= now
```

4. Результат сортируется:

```text
starts_at ASC, id ASC
```

5. Для каждого Lesson API возвращает Teacher как `id + display_name`.
6. Frontend преобразует UTC / timezone-aware moment в локальное время браузера.
7. Frontend отображает Teacher, дату и время.
8. Frontend поддерживает `loading / empty / error / success`.

## Acceptance Criteria — AC-02

Student видит только собственные предстоящие Lesson.

Обязательно проверить:

- Lesson с `starts_at < now` отсутствует;
- Lesson с `starts_at == now` включён;
- Lesson с `starts_at > now` включён;
- Lesson другого Student отсутствует;
- несколько Lesson отсортированы по `starts_at ASC`, а при равном `starts_at` — по `id ASC`;
- одинаковый абсолютный момент с разными timezone offsets трактуется одинаково;
- Teacher отображается человекочитаемо через `display_name`;
- пустой результат отображается как корректный empty state;
- authentication / role errors отображаются как error state.

Backend фиксирует `now` один раз на операцию. Для воспроизводимых boundary tests используется управляемое / замороженное время.

**Business Rules:** [BR-04](../../requirements/business-rules.md#br-04--принадлежность-занятий-ученику), [BR-05](../../requirements/business-rules.md#br-05--предстоящие-занятия), [BR-06](../../requirements/business-rules.md#br-06--порядок-предстоящих-занятий), [BR-09](../../requirements/business-rules.md#br-09--роль-account-и-доменный-контекст), [BR-11](../../requirements/business-rules.md#br-11--человекочитаемое-представление-участника), [BR-12](../../requirements/business-rules.md#br-12--локальная-временная-зона-ui-и-недельный-календарь).

**API:** [API-06](../../api/contracts/sprint-01.md#api-06--предстоящие-lesson-ученика).

# US-03 — Календарь преподавателя

## User Story

Как Teacher, я хочу видеть свои занятия за выбранную неделю в календаре, чтобы ориентироваться в расписании.

## UI-период Sprint 1

Календарь Teacher в Sprint 1 — недельный.

Frontend:

- при первом открытии показывает текущую локальную неделю;
- позволяет перейти на предыдущую неделю;
- позволяет перейти на следующую неделю;
- использует timezone браузера;
- считает начало недели как Monday `00:00` local;
- считает конец периода как следующий Monday `00:00` local;
- преобразует обе локальные границы в timezone-aware absolute moments;
- не вычисляет конец недели простым прибавлением фиксированных `7 * 24` часов вокруг DST transition.

Backend не хранит browser timezone и не обязан восстанавливать timezone name.

## Минимальный сценарий

1. Backend определяет текущего Teacher из authentication context.
2. Frontend определяет выбранную локальную неделю.
3. Frontend вычисляет `from` / `to` по BR-12.
4. Frontend отправляет timezone-aware ISO 8601 query parameters.
5. Backend проверяет:

```text
from < to
```

6. Backend возвращает только Lesson текущего Teacher, удовлетворяющие:

```text
from <= starts_at < to
```

7. Результат сортируется:

```text
starts_at ASC, id ASC
```

8. Для каждого Lesson Student представлен как `id + display_name`.
9. Frontend отображает Lesson в локальном времени браузера.
10. При переключении недели новый результат не должен быть заменён более старым запоздавшим response.
11. Frontend поддерживает `loading / empty / error / success`.

## Acceptance Criteria — AC-03

Календарь показывает только Lesson текущего Teacher за выбранную локальную неделю.

Обязательно проверить:

- `starts_at == from` включается;
- `from < starts_at < to` включается;
- `starts_at == to` исключается;
- Lesson вне периода исключается;
- Lesson другого Teacher исключается;
- соседние недели не дублируют Lesson на общей границе;
- `from >= to` отклоняется;
- timezone-aware values с разными offsets сравниваются как абсолютные моменты;
- Student отображается через `display_name`;
- current / previous / next week используют browser-local boundaries;
- DST transition не ломает вычисление недельных границ;
- stale response не подменяет результат более новой выбранной недели;
- empty / error / loading / success states отображаются корректно.

API-07 технически принимает любой валидный абсолютный диапазон `[from, to)`, но пользовательский UI Sprint 1 формирует недельные диапазоны согласно BR-12.

**Business Rules:** [BR-07](../../requirements/business-rules.md#br-07--календарная-выборка), [BR-09](../../requirements/business-rules.md#br-09--роль-account-и-доменный-контекст), [BR-11](../../requirements/business-rules.md#br-11--человекочитаемое-представление-участника), [BR-12](../../requirements/business-rules.md#br-12--локальная-временная-зона-ui-и-недельный-календарь).

**API:** [API-07](../../api/contracts/sprint-01.md#api-07--lesson-в-календарном-периоде-teacher).

# Сквозная приёмка Sprint 1

Минимальный end-to-end результат Sprint 1:

```text
Teacher registers / logs in
→ Backend возвращает trusted context
→ Teacher получает связанных Students
→ Teacher создаёт Lesson
→ Lesson сохраняется в PostgreSQL
→ Student logs in
→ Student видит Lesson в upcoming, если выполняется BR-05
→ Teacher видит Lesson в weekly calendar, если он попадает в [from, to)
```

Для сквозной проверки должны использоваться реальные Frontend ↔ Backend requests, а не только независимые mocks.

Проверяются как минимум:

- Bearer authentication;
- role authorization;
- Account / Teacher / Student ID separation;
- Teacher–Student relation;
- Lesson persistence;
- ErrorDTO;
- `display_name`;
- UTC / browser-local conversion;
- upcoming `starts_at >= now`;
- weekly calendar `[from, to)`;
- empty / error / success states.

# За пределами Sprint 1

В Sprint 1 не входят:

- проверка конфликтов расписания;
- перенос занятий;
- отмена занятий;
- duration / `ends_at`;
- расширенные Lesson statuses;
- attendance;
- recurring lessons;
- homework;
- progress / statistics;
- password recovery / reset;
- email confirmation;
- изменение password;
- multi-role Account;
- смена роли;
- refresh token;
- server-side logout / token revocation;
- OAuth / внешний identity provider;
- пользовательское управление Teacher–Student relations;
- расширенные профили;
- admin panel;
- расширенное Account management.

Эти возможности не являются критериями приёмки Sprint 1. Их требования и сроки определяются отдельными backlog items / будущими инкрементами.

# Ожидаемый результат Sprint 1

К завершению Sprint 1 должна существовать техническая основа Takt и проверяемый сквозной сценарий:

- пользователь может зарегистрироваться и войти;
- Backend формирует доверенный Account / role / profile context;
- Teacher работает только со связанными Student;
- Teacher создаёт допустимый Lesson;
- Lesson сохраняется в PostgreSQL;
- Student видит собственные предстоящие Lesson;
- Teacher видит собственные Lesson в недельном календаре;
- Frontend и Backend интегрированы по утверждённому API contract;
- ошибки имеют единый проектный формат;
- время корректно проходит границу API и отображается в browser-local timezone;
- применимые QA / Product Acceptance могут быть выполнены по воспроизводимым критериям.

Документация описывает **целевой согласованный результат Sprint 1**, а не автоматически подтверждает его фактическую реализацию.

Изменение этого scope выполняется только через [Change Management](../../process/change-management.md) с синхронизацией Sprint Planning / Kaiten, связанных требований, API / design / tasks и QA.
