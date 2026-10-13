# Code Review

[К справочнику](../README.md) · [Workflow](development-workflow.md) · [DoR / DoD](definition-of-ready-done.md) · [Ветки и PR](branching-and-pr.md) · [QA / Acceptance](qa-and-acceptance.md) · [Change Management](change-management.md)

## Назначение

Code Review проверяет, что изменение технически корректно, соответствует согласованному scope и не ломает архитектурные, API, data и process boundaries проекта.

Code Review не заменяет:

- Design Review;
- Integration;
- QA;
- Product Acceptance.

Один участник может выполнять несколько ролей, но результаты этих проверок остаются разными по смыслу и evidence.

## Виды проверки

| Вид | Основной вопрос | Результат |
| --- | --- | --- |
| Code Review | Корректно ли реализовано изменение и соблюдены ли технические границы? | Технические замечания и решение по review |
| Design Review | Соответствует ли UI/UX пользовательскому сценарию, данным и состояниям? | Согласованный design / UX result |
| Integration | Работают ли затронутые компоненты через реальную границу обмена? | Подтверждённый интеграционный сценарий |
| QA | Выполняются ли AC / BR / error cases и не сломана ли затронутая регрессия? | Проверки, defects, retest |
| Product Acceptance | Достигнут ли согласованный пользовательский результат? | Решение Product Owner |

Наличие одного вида проверки не считается автоматическим прохождением остальных.

## Подготовка автора к review

До запроса финального review автор выполняет self-review и проверяет:

- diff соответствует scope задачи;
- нет случайных unrelated changes;
- нет секретов, credentials, реальных персональных данных и debug artifacts;
- применимые tests / локальные проверки выполнены;
- API / DB / UI / docs impact отражён в PR;
- каноническая документация обновлена, если изменение меняет описанное поведение;
- известные limitations / blockers указаны явно;
- PR содержит достаточно context и evidence для независимой проверки.

Reviewer не должен восстанавливать основной замысел изменения только по коду или устному объяснению автора.

## Что проверяет reviewer

Reviewer проверяет только применимые области, но обязан понимать, какие границы реально затронуты.

### Scope и требования

Проверить:

- diff соответствует Technical Task / Foundation / User Story;
- Acceptance Criteria не подменены другим поведением;
- out-of-scope не добавлен незаметно;
- product decision не придуман разработчиком;
- изменение не противоречит актуальным BR / API / architecture docs.

Если review обнаруживает неизвестное продуктовое поведение, reviewer не выбирает его самостоятельно: вопрос возвращается к Product Owner / specification flow.

### Архитектура

Проверить:

- зависимости компонентов направлены согласно architecture baseline;
- не вводится новая архитектура / library / infrastructure без необходимости;
- API, Services, Persistence и Frontend boundaries не смешиваются;
- существенное архитектурное решение при необходимости проходит ADR process;
- локальный refactoring не создаёт скрытую новую публичную границу.

### Backend

По применимости проверить:

- HTTP-layer не содержит полной business logic / прямого SQL вместо согласованных слоёв;
- trusted identity строится Backend, а не из пользовательского `teacher_id` / `student_id`;
- business rules проверяются в authoritative layer;
- transaction boundary соответствует use case;
- error mapping соответствует проектному ErrorDTO;
- неожиданные persistence / response errors не маскируются как клиентская validation error;
- secrets и credentials не логируются.

### API и integration contract

Если изменён внешний обмен, проверить:

- method / path;
- authentication / role;
- request DTO;
- response DTO;
- required / nullable semantics;
- HTTP status;
- stable `error.code`;
- sorting;
- time semantics;
- структурированные человекочитаемые поля имени (`first_name`, `last_name`, `middle_name`), где они требуются;
- runtime OpenAPI impact;
- синхронизацию Frontend / Backend / docs.

Нельзя принимать молчаливое изменение API только потому, что обе стороны можно «потом подправить».

### Persistence / database

Если затронуты данные, проверить:

- schema соответствует data model;
- foreign keys / unique constraints / domain invariants;
- необходимость Alembic migration;
- migration не теряет данные без согласованной причины;
- seed / demo / test fixtures обновлены, если это требуется;
- ORM model не протекает наружу как неявный public DTO;
- атомарные use cases не оставляют частичное состояние.

### Frontend

По применимости проверить:

- сетевые запросы идут через централизованный API-layer;
- UI не является источником authorization;
- role / profile context берётся из Backend;
- User / Profile / TeacherProfile / StudentProfile IDs не смешиваются;
- API DTO преобразуется в UI state явно;
- предусмотрены нужные `loading / empty / error / success` states;
- error handling использует HTTP status / `error.code`, а не текст message;
- date-time корректно преобразуется между UTC / aware API values и browser-local UI;
- stale response не подменяет более актуальное состояние, где это применимо.

### Tests и evidence

Проверить:

- tests покрывают реально изменённое поведение;
- happy path не является единственной проверкой, если есть значимые error / boundary cases;
- test names и assertions действительно подтверждают заявленный результат;
- mocks используют согласованный contract;
- mock-only verification не выдаётся за Integration;
- evidence относится к актуальной версии изменения.

Фраза «tests green» не заменяет проверку отсутствующего или неверного Acceptance Criterion.

### Documentation

Для docs-review проверить:

- документ имеет понятный канонический scope;
- термины согласованы с glossary / соседними документами;
- ссылки ведут в правильные файлы / anchors;
- нет устаревших Q / blockers / TBD;
- статус реализации не выдуман из целевого design;
- правило не дублируется конфликтующим образом в нескольких местах;
- изменение не создаёт противоречия Product ↔ BR ↔ API ↔ Data Model ↔ Frontend / Backend ↔ Sprint scope.

## Классы review comments

Review comments делятся по влиянию.

### Blocking

Blocking comment означает, что PR нельзя merge до исправления или явно согласованного альтернативного решения.

Примеры:

- нарушение BR / Acceptance Criteria;
- security / authorization defect;
- data integrity issue;
- broken / undocumented API compatibility;
- неверная migration;
- отсутствие обязательной обработки error path;
- known failing test в затронутом scope;
- существенное противоречие документации;
- случайное включение secrets / credentials / private data;
- изменение за пределами согласованного scope, которое нельзя безопасно принять как есть.

### Non-blocking

Non-blocking comment — улучшение, которое не мешает корректности текущего scope.

Примеры:

- небольшое улучшение naming;
- локальное упрощение без влияния на поддержку / correctness;
- future refactoring idea;
- style suggestion, не противоречащий принятому baseline.

Reviewer явно отличает blocking issue от suggestion, чтобы автор понимал merge gate.

## Как писать замечание

Полезное замечание содержит:

1. что именно не так;
2. почему это важно;
3. какой результат требуется.

Предпочтительный формат по смыслу:

```text
Проблема → последствие → ожидаемый результат
```

Reviewer не обязан диктовать конкретную реализацию, если существует несколько корректных вариантов.

Не использовать review для навязывания новой библиотеки, architecture pattern или личного style preference без конкретной связи с quality / requirement / project baseline.

## Работа автора с замечаниями

На каждый substantive comment автор:

- исправляет проблему; либо
- отвечает с аргументом и предлагает альтернативу.

Если принято альтернативное решение, оно должно быть отражено в соответствующем каноническом источнике, если меняет архитектуру, API, BR или process rule.

Нельзя закрывать discussion только для визуальной чистоты PR.

`Resolve conversation` допустим после фактического исправления / согласования, но сам по себе не является evidence устранения проблемы.

## Повторный review

После значимого изменения reviewer повторно проверяет затронутую область.

Повторный review особенно обязателен, если после первого review изменились:

- API DTO / status / error code;
- authentication / authorization logic;
- database schema / migration;
- transaction boundary;
- architecture dependency;
- business rule implementation;
- significant UI flow;
- документация, определяющая внешний контракт.

Если исправление локальное и очевидное, объём повторного review может быть ограничен соответствующим diff.

Старое approval не считается достаточным для части изменения, которая существенно изменилась после него.

## Спорные вопросы и escalation

Если автор и reviewer не сходятся:

- по продуктовому поведению / scope / AC — подключается Product Owner;
- по технической области — применимый owner / второй компетентный reviewer;
- по cross-component API — Backend / Frontend участники интеграции;
- по существенному архитектурному выбору — ADR process;
- по изменению уже согласованного baseline — change management.

Цель escalation — получить проверяемое решение и зафиксировать его, а не определить «кто главнее».

## Решение по Code Review

Финальный результат review по смыслу один из следующих:

- **Changes required** — остаётся хотя бы один blocking issue;
- **Approved** — blocking issues отсутствуют, review актуальной версии завершён.

Draft PR, отсутствие комментариев или механически закрытые threads не равны `Approved`.

Количество approvals для каждого PR этим документом не задаётся. Применимый reviewer / reviewers определяются задачей и риском изменения.

## Связь с merge

Code Review является обязательным gate обычного PR workflow, но не полным Definition of Done.

После `Approved` merge дополнительно подчиняется правилам [branching-and-pr](branching-and-pr.md).

Merged PR не означает автоматическое прохождение:

- Integration;
- QA;
- Product Acceptance;
- parent User Story acceptance.

## Минимальный reviewer checklist

Перед `Approved` reviewer должен иметь основания ответить «да» на применимые вопросы:

- Scope соответствует задаче?
- Требования / BR соблюдены?
- Architecture boundaries не нарушены?
- Authorization корректна?
- API contract не расходится с реализацией?
- Data integrity / migration корректны?
- Error handling соответствует проектной модели?
- Tests действительно проверяют изменение?
- Integration impact учтён?
- Документация обновлена?
- Нет accidental files / secrets / private data?
- Все blocking comments закрыты по существу?
- Approval относится к актуальной версии diff?
