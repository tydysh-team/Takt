# Шаблон Bug Report

[К справочнику](../README.md) · [QA / Product Acceptance](../process/qa-and-acceptance.md) · [DoR / DoD](../process/definition-of-ready-done.md) · [Change Management](../process/change-management.md)

## Как использовать

Шаблон используется для дефекта: фактическое поведение расходится с уже согласованным ожидаемым поведением.

Если обнаружено новое пожелание или требуется изменить само согласованное поведение, это **change request**, а не defect. Применяется [Change Management](../process/change-management.md).

Bug Report должен позволять другому участнику:

- понять, что именно сломано;
- воспроизвести проблему;
- найти источник ожидаемого поведения;
- оценить влияние;
- проверить исправление на конкретной версии.

Не публиковать в bug report, screenshots, logs или HTTP evidence:

- реальные passwords;
- Bearer tokens;
- password hashes;
- secrets / API keys;
- реальные персональные данные;
- SQL с чувствительными данными;
- stack traces / internal diagnostics, если карточка доступна шире необходимого.

Использовать синтетические test data и sanitized evidence.

# Карточка

| Поле | Что указать |
| --- | --- |
| ID | ID defect card в Kaiten |
| Title | Короткое наблюдаемое несоответствие + затронутый сценарий |
| Affected task / US / Foundation | ID и ссылка |
| Requirement source | AC / BR / API contract / design / process rule |
| Severity | `Blocker / Critical / Major / Minor` + краткое обоснование |
| Priority | Фактическое решение triage либо `TBD`; не выводится автоматически из severity |
| Assignee | Назначенный исполнитель |
| Reporter / QA | Кто зафиксировал дефект |
| Detected on | Branch / commit / build |
| Environment | Где воспроизведено |
| Reproducibility | `Always / Intermittent / Once / Cannot reproduce` + детали |
| Related links | PR / task / logs / evidence / related defects |

Kaiten остаётся источником фактического status, assignee, priority и lifecycle defect card.

# Title

Формулировать через наблюдаемую проблему.

Хорошо:

```text
Teacher может создать Lesson для несвязанного Student
```

или:

```text
API-07 включает Lesson с starts_at == to
```

Плохо:

```text
Что-то не работает
```

Не указывать предполагаемую root cause в title, если она не доказана.

# Environment

Указать достаточно данных для воспроизведения.

## Версия

- Frontend branch / commit / build:
- Backend branch / commit / build:
- DB migration revision, если влияет:
- API contract revision / ссылка:

## Среда

- local / test / staging:
- OS:
- browser + version, если UI:
- browser/system timezone, если влияет на date-time:
- Backend / DB config, только если это безопасно и действительно влияет:

Не прикладывать `.env` целиком.

# Preconditions

Зафиксировать исходное состояние.

По применимости:

- роль пользователя;
- какой User / Teacher / Student context используется;
- необходимые Teacher–Student relations;
- существующие Lesson;
- seed / fixture;
- выбранная календарная неделя;
- controlled / frozen `now`;
- другие prerequisite actions.

Использовать только синтетические идентификаторы / данные.

Пример:

```text
- Current User role: teacher.
- Current Teacher связан со Student A.
- Student B существует, но relation с текущим Teacher отсутствует.
- now = 2026-10-12T06:00:00Z.
```

# Steps to reproduce

Действия должны быть достаточно точными, чтобы другой участник смог повторить дефект.

Пример UI:

1. Выполнить login как Teacher.
2. Открыть экран создания Lesson.
3. Выбрать ...
4. Ввести ...
5. Нажать ...
6. Наблюдать результат.

Для API указать:

- method;
- path;
- существенные path / query parameters;
- sanitized request body;
- нужную роль / authentication state;
- существенные headers **без реального credential**.

Пример:

```http
POST /api/v1/lessons
Authorization: Bearer <redacted>
Content-Type: application/json

{
  "student_id": "22222222-2222-4222-8222-222222222222",
  "starts_at": "2026-10-12T10:00:00+04:00"
}
```

# Expected result

Ожидаемый результат должен иметь каноническое основание.

Указать:

- ссылку на AC / BR / API contract / design;
- конкретное ожидаемое observable behavior.

Пример:

```text
Согласно BR-02 и API-05 Backend должен отклонить создание Lesson
для Student, не связанного с текущим Teacher, и вернуть
404 student_not_available. Новый Lesson не создаётся.
```

Не формулировать новое requirement только внутри bug report.

# Actual result

Описать, что фактически произошло.

По применимости указать:

- UI behavior;
- HTTP status;
- `error.code`;
- response body в sanitized виде;
- persisted result;
- side effect;
- повторяемость.

Пример:

```text
Backend возвращает 201 и создаёт Lesson для несвязанного Student.
```

Отделять **наблюдение** от гипотезы о причине.

Допустимо:

```text
Наблюдение: API вернул 500 internal_error.
Предположение: возможна ошибка mapping unique constraint.
```

Нельзя выдавать предположение за подтверждённую root cause.

# Reproducibility

Указать один вариант и детали:

- `Always` — воспроизводится при каждом повторе в указанных условиях;
- `Intermittent` — воспроизводится не всегда; указать частоту / условия;
- `Once` — наблюдалось один раз, повторить пока не удалось;
- `Cannot reproduce` — на текущей проверяемой версии не воспроизводится.

Для intermittent defect по возможности указать:

- число повторов;
- сколько раз проявился;
- timing / concurrency conditions;
- browser / timezone / data dependency.

# Impact

Кратко описать влияние:

- какой пользовательский сценарий нарушен;
- нарушается ли Acceptance Criterion;
- есть ли риск data integrity;
- есть ли authorization / confidentiality impact;
- блокируется ли QA / Product Acceptance;
- есть ли workaround.

Не дублировать severity; объяснить фактическое влияние.

# Severity

Использовать критерии из [QA process](../process/qa-and-acceptance.md#severity).

| Severity | Когда выбирать |
| --- | --- |
| `Blocker` | Невозможно продолжить критичную проверку / сценарий без обходного пути либо результат принципиально непроверяем |
| `Critical` | Потеря / повреждение данных, серьёзное нарушение authorization / confidentiality, тяжёлый отказ ключевого сценария |
| `Major` | Существенно нарушен AC / основной сценарий; отсутствует нормальное поведение или workaround сильно ограничен |
| `Minor` | Локальное визуальное / текстовое / небольшое отклонение без разрушения основного согласованного сценария |

Severity описывает **влияние**, а не очередь исправления.

Priority определяется отдельно во время triage.

Не снижать severity только потому, что defect неудобно исправлять в текущем Sprint.

# Evidence

Приложить только evidence, которое помогает проверить дефект.

Возможные материалы:

- screenshot;
- video;
- sanitized request / response;
- safe log fragment;
- test output;
- DB observation на synthetic data;
- timestamp;
- branch / commit / build.

Для API желательно зафиксировать:

```text
Method:
Path:
Request:
HTTP status:
Response:
error.code:
Timestamp:
Backend commit:
```

Для time-related defect обязательно указать:

- `now`, если он контролировался;
- input offset;
- returned UTC value;
- browser/system timezone;
- локальное отображённое значение.

Evidence должно относиться к версии, указанной в `Detected on`.

# Security / privacy check

Перед публикацией evidence проверить:

- [ ] token скрыт;
- [ ] password отсутствует;
- [ ] private / real user data отсутствуют или anonymized;
- [ ] secret / `.env` values отсутствуют;
- [ ] stack trace / SQL не раскрывают sensitive data;
- [ ] screenshots не содержат лишних персональных данных.

# Triage

Во время triage уточнить:

- дефект подтверждён или требуется clarification;
- affected scope;
- severity;
- priority;
- assignee;
- dependency / blocker impact;
- duplicate status;
- нужен ли product clarification;
- является ли проблема на самом деле change request.

## Возможные решения triage

- `Confirmed` — defect подтверждён;
- `Duplicate` — есть существующая defect card;
- `Rejected` — фактическое поведение соответствует утверждённому requirement;
- `Cannot reproduce` — недостаточно evidence для подтверждения на текущей версии;
- `Needs clarification` — противоречивое / неопределённое expected behavior;
- `Change request` — требуется изменить requirement, а не исправить реализацию.

Это логическая классификация и не требует отдельных Kaiten columns для каждого значения.

Duplicate / Rejected / Cannot reproduce должны иметь причину и ссылки / evidence.

# Fix information

Заполняется после подготовки исправления.

- fix branch:
- fix commit:
- Pull Request:
- краткое описание исправления:
- затронутые components:
- изменялся ли canonical requirement / API contract: `yes / no`;
- если `yes` — ссылка на согласованный change:

Исправление defect обычно **не меняет expected behavior**.

Если для «исправления» пришлось изменить requirement / API contract, это должно быть оформлено как change, а не скрыто внутри fix PR.

# Retest

Retest выполняется на версии, содержащей заявленное исправление.

## Retest environment

- Frontend commit / build:
- Backend commit / build:
- environment:
- test data:
- timezone / controlled `now`, если применимо:

## Retest steps

Повторить исходный defect case и необходимые дополнительные проверки.

## Retest result

Результат:

```text
PASS / FAIL / BLOCKED
```

Зафиксировать:

- actual result;
- evidence;
- tester;
- timestamp / version.

`PASS` означает, что исходный defect case больше не воспроизводится и ожидаемый результат подтверждён.

Если defect всё ещё воспроизводится:

```text
FAIL → Reopened
```

`BLOCKED` не равен `PASS`.

# Regression after fix

Указать затронутую regression, которую необходимо повторить.

По применимости:

- основной happy path;
- соседние validation cases;
- authentication / authorization;
- data integrity;
- API consumers;
- ErrorDTO;
- date-time boundaries;
- UI states;
- Frontend ↔ Backend integration.

Пример:

```text
Fix student_not_available:
- связанный Student всё ещё позволяет создать Lesson;
- несвязанный Student отклоняется;
- несуществующий Student даёт тот же public 404;
- Teacher identity определяется из auth context;
- отклонённые операции не создают Lesson.
```

# Closure criteria

Defect может быть закрыт, когда:

- причина завершения понятна;
- для исправленного defect есть актуальная fix version;
- исходный case прошёл retest;
- применимая regression выполнена;
- evidence относится к актуальной версии;
- blocking impact устранён;
- related task / QA status синхронизированы в Kaiten.

Автор исправления не заменяет retest сообщением «у меня работает».

Если QA и автор fix — один человек по фактическому назначению, evidence всё равно должно позволять независимо понять, что именно проверялось и на какой версии.
