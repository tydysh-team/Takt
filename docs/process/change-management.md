# Управление изменениями

[К справочнику](../README.md) · [Workflow](development-workflow.md) · [DoR / DoD](definition-of-ready-done.md) · [Code Review](code-review.md) · [QA / Acceptance](qa-and-acceptance.md) · [ADR](../architecture/decisions/README.md) · [Интеграция](../architecture/integration.md)

## Назначение

Change Management нужен, чтобы согласованное изменение не появлялось только в одном месте — например, в коде, UI, OpenAPI, тесте или комментарии — и не создавало скрытое расхождение между частями проекта.

Основной принцип:

> Сначала определяется смысл изменения и его impact, затем обновляется канонический источник и зависимые артефакты, после чего изменение реализуется и повторно проверяется.

Нельзя вводить новое продуктовое, API, data, architecture или process rule молча только в реализации.

## Что считается изменением

Change Management применяется, если меняется уже согласованное или используемое поведение / ограничение, например:

- Acceptance Criteria;
- Business Rule;
- Sprint scope;
- method / path API;
- request / response DTO;
- authentication / authorization semantics;
- stable `error.code`;
- time semantics;
- sorting;
- data model / DB constraint;
- architecture baseline;
- UI/UX behavior;
- Definition of Ready / Definition of Done;
- другой канонический process rule.

Обычный локальный refactoring, не меняющий observable behavior, public contract, данные, архитектурные границы или process rule, не требует отдельного продуктового change request. Он всё равно проходит обычный review.

## Канонический источник

Изменение сначала отражается в том источнике, который отвечает за соответствующее решение.

| Тип изменения | Канонический источник | Кто должен участвовать в согласовании по смыслу | Типичные зависимые артефакты |
| --- | --- | --- | --- |
| Product behavior / Business Rule | `docs/product/`, `docs/requirements/business-rules.md` | Product Owner; технические owners при impact на реализацию | Sprint scope, AC, API, UI, QA, tasks |
| Sprint scope / Acceptance Criteria | Sprint Planning / Kaiten + `docs/sprints/.../scope.md` | Product Owner + команда | Tasks, SP / dependencies, API / design / QA, reporting |
| API / DTO / HTTP semantics | `docs/api/contracts/` + общие API docs | Backend + Frontend; PO если меняется продуктовый смысл | OpenAPI, schemas, API-layer, mocks, UI mapping, tests |
| Authentication / authorization | API auth contract + BR / architecture при необходимости | Backend; Frontend для consumer impact; PO при product behavior | `/me`, route behavior, UI role flow, tests, QA |
| Error model | `docs/api/errors.md` + endpoint contract | Backend + Frontend | exception mapping, OpenAPI, UI error handling, tests |
| Data model / DB invariant | `docs/architecture/data-model.md` | Backend / DB owner; PO если появляются новые доменные данные / правила | Alembic migration, ORM, DTO при влиянии, fixtures, persistence tests |
| Architecture baseline | architecture docs + ADR, если применимы критерии ADR | затронутые technical owners; PO при product / API impact | module boundaries, setup, tasks, review checklist |
| UX / UI behavior | утверждённый design source + применимые product / scope docs | UX/UI + Frontend; PO для пользовательского поведения | UI task, API/data при влиянии, AC, QA |
| Process rule | `docs/process/` | команда; владельцы затронутого процесса | DoR / DoD, templates, Kaiten workflow usage |
| Defect fix без изменения требования | исходный requirement остаётся каноничным | owner + reviewer + QA по задаче | tests, code, bug card, regression evidence |

Kaiten хранит фактическое состояние change / task / blocker. GitHub хранит implementation history и review. `/docs` хранит согласованные правила.

## Change request и defect — не одно и то же

**Defect** — фактическое поведение не соответствует уже согласованному ожидаемому поведению.

**Change request** — требуется изменить само согласованное ожидаемое поведение.

Пример:

- API должен возвращать `409 email_already_registered`, но возвращает `500` → defect;
- команда решает вместо `409` использовать другую согласованную semantics → change request.

Нельзя закрывать defect изменением документации задним числом только для того, чтобы текущее поведение стало «правильным», без явного решения о смене требования.

И наоборот, новое пожелание не должно автоматически объявляться дефектом старой корректной реализации.

## Классификация impact

Перед реализацией инициатор и применимые owners определяют, какие области затронуты.

Минимальный impact checklist:

- Product / BR;
- Sprint scope / AC;
- Backend;
- Frontend;
- API contract;
- authentication / authorization;
- ErrorDTO / error codes;
- data model / migration;
- demo / test fixtures;
- UI / UX;
- integration;
- QA / regression;
- docs;
- task dependencies / sequence;
- Story Points / estimate;
- ADR / architecture decision.

Необязательно затрагивать все пункты. В change record должно быть понятно, какие пункты `affected`, а какие `N/A`.

## Порядок изменения

### 1. Зафиксировать инициатор и причину

Change должен иметь понятный источник:

- новый product decision;
- уточнение requirement;
- обнаруженное противоречие;
- technical limitation;
- integration finding;
- QA finding;
- architecture decision;
- dependency change.

Зафиксировать кратко:

- **before** — что согласовано сейчас;
- **after** — что предлагается;
- **reason** — почему требуется изменение;
- **affected scope** — какие User Story / Foundation / Technical Tasks / компоненты затронуты.

### 2. Выполнить impact analysis

До implementation определить:

- меняется ли пользовательское поведение;
- меняются ли Acceptance Criteria;
- является ли изменение breaking для существующего consumer;
- нужна ли DB migration;
- затрагиваются ли уже начатые Backend / Frontend tasks;
- делает ли изменение старые tests / mocks / evidence неактуальными;
- требуется ли re-estimation / изменение dependency order;
- требуется ли ADR.

Если impact невозможно определить из-за неизвестного продуктового решения, change остаётся blocker до уточнения.

### 3. Получить необходимое решение

Участники определяются типом изменения, а не только тем, кто первым написал код.

Принцип:

- Product Owner принимает продуктовые решения и изменения AC / scope;
- Backend / Frontend согласуют cross-component contract;
- применимый technical owner участвует в изменении своей technical boundary;
- UX/UI участвует в изменении согласованного UI behavior;
- QA участвует в определении regression impact, но не придумывает новое expected behavior;
- существенное architecture decision проходит ADR process.

Scrum Master помогает сделать change и blocker прозрачными, но не заменяет Product Owner, reviewer или technical owner.

### 4. Обновить канонический источник

До либо одновременно с implementation обновляется документ, который определяет новое правило.

Нельзя считать достаточным:

- устный договор;
- комментарий в PR;
- изменение OpenAPI без contract update;
- изменение Figma без обновления затронутого AC / scope;
- новый test, который единолично вводит новое требование;
- код, который «заодно» меняет behavior.

Исторический Q-ID / ADR / решение не удаляется так, будто его не существовало, если он нужен для понимания истории. Для ADR используется lifecycle из ADR registry.

### 5. Синхронизировать зависимые артефакты

После изменения canonical source обновляются все реально затронутые consumers.

Примеры:

**BR change**

```text
BR
→ Sprint AC / scope
→ API contract
→ Backend / Frontend tasks
→ QA cases
```

**API change**

```text
API contract
→ Backend schemas / routes / OpenAPI
→ Frontend API-layer / DTO mapping
→ mocks
→ integration checks
→ QA
```

**Data model change**

```text
data-model.md
→ migration
→ ORM / persistence
→ fixtures / seed
→ API contract, если внешний DTO затронут
→ tests
```

**UI behavior change**

```text
product / AC
→ design
→ Frontend task
→ API / data, если нужны новые данные
→ QA
```

## Изменение во время активного Sprint

Изменение Sprint 1 не должно появляться только потому, что исполнитель заметил «как будет удобнее».

Если change влияет на текущий Sprint:

1. определить, является ли это defect существующего scope или новым requirement;
2. оценить impact на Sprint Goal, текущие tasks, dependencies и SP;
3. согласовать изменение scope с Product Owner и командой;
4. обновить Kaiten / Sprint Planning artifacts и `scope.md`, если scope действительно изменился;
5. обновить затронутые technical contracts / docs;
6. только после этого использовать новое правило как основу реализации / QA.

Нельзя сохранять старый scope в документации и одновременно реализовывать другой scope «по договорённости».

Если новый request не нужен для Sprint Goal и не входит в принятый Sprint scope, он может быть вынесен в Product Backlog / future scope вместо скрытого расширения текущей задачи.

## Изменение задачи после Ready

Если после Ready меняются условия, влияющие на реализацию, задача повторно проверяется по DoR.

Особенно если изменились:

- Acceptance Criteria;
- API contract;
- design;
- data model;
- dependency;
- security / authorization semantics;
- объём работ.

Задача не сохраняет статус Ready автоматически после изменения, которое сделало предыдущую подготовку неактуальной.

Если change существенно увеличивает scope, работа может быть разделена на отдельные Technical Tasks.

## Изменение после Code Review / QA

Старое evidence не считается актуальным автоматически после изменения.

После изменения повторяются все проверки, на которые оно могло повлиять.

Примеры:

- изменился DTO → повторный Code Review + Frontend / Backend Integration + QA;
- изменилась migration → повторный persistence review / test;
- изменилось BR → повторные business-rule tests + QA + Product Acceptance при необходимости;
- изменился UI behavior → Design Review / Frontend review / QA в затронутом scope;
- изменился только комментарий / naming без behavior impact → повторный scope проверки может быть минимальным.

Решение о повторной проверке основывается на impact, а не на желании сохранить старый `PASS`.

## API compatibility

API change считается значимым, если меняет хотя бы одну публичную часть:

- method;
- path;
- authentication requirement;
- role semantics;
- request field;
- response field;
- required / nullable semantics;
- type;
- HTTP success status;
- error status / stable `error.code`;
- sorting;
- time semantics.

Во время параллельной разработки Backend и Frontend согласуют новую редакцию contract **до того, как обе стороны начнут расходиться по разным версиям**.

Для изменения указать:

- old contract behavior;
- new contract behavior;
- affected Backend / Frontend tasks;
- порядок обновления;
- необходимость временной совместимости;
- integration check;
- какую редакцию контракта использует каждая сторона до завершения перехода.

Для Sprint 1, пока публичных внешних consumers нет, синхронное breaking change внутри `/api/v1` допустимо только как согласованное изменение команды с одновременным обновлением contract и consumers. Это не делает молчаливое изменение допустимым.

Runtime OpenAPI является отражением реализации, а не самостоятельным источником нового решения.

## Data / migration changes

При изменении persisted schema определить:

- новое / изменённое поле или relation;
- constraint;
- необходимость migration;
- поведение существующих данных;
- seed / demo / test fixture impact;
- rollback / failure risks;
- API impact;
- Business Rule impact.

Нельзя добавлять доменное поле только потому, что оно удобно ORM / UI, если соответствующего requirement нет.

Если migration реализует новое Business Rule, BR должен быть согласован до того, как constraint становится единственным источником этого правила.

## Architecture changes и ADR

Не каждое техническое изменение требует ADR.

ADR создаётся, если change соответствует критериям из [ADR registry](../architecture/decisions/README.md), например:

- меняет утверждённый architecture baseline;
- имеет несколько значимых альтернатив;
- создаёт долгосрочное ограничение;
- влияет на несколько частей системы;
- должно оставаться объяснимым после завершения текущей задачи.

ADR объясняет **почему** принято решение и его последствия.

После принятия ADR всё равно обновляются канонические architecture / API / BR документы, которые определяют текущее действующее поведение.

ADR не заменяет API contract или Business Rule.

## Срочное исправление

Даже срочный defect fix не должен создавать неизвестное постоянное правило.

Для срочного исправления допускается сократить административный объём, но минимум сохраняется:

- проблема и impact понятны;
- затронутый canonical contract известен;
- fix проходит review;
- применимые tests / regression выполняются;
- docs обновляются, если реальное согласованное поведение изменилось.

Если срочный fix временно отличается от желаемой architecture / design, это фиксируется как technical follow-up, а не забывается после merge.

## Что должно остаться после change

После завершённого изменения должно быть возможно ответить:

- что изменилось;
- почему;
- кто принял применимое решение;
- какой canonical source теперь действующий;
- какие tasks / components были затронуты;
- какие dependent artifacts обновлены;
- какая версия / PR реализует change;
- какие review / tests / QA были повторены;
- остались ли follow-up items.

Историю не нужно дублировать во всех документах: достаточно актуального canonical state и ссылок на task / PR / ADR / change context там, где это необходимо.

## Запрещённые практики

Не допускается:

- менять requirement только в коде;
- менять API только в OpenAPI / Pydantic schema без contract update;
- менять DTO независимо на Backend и Frontend;
- использовать новый QA test как единственный источник нового требования;
- менять Sprint scope без синхронизации Kaiten / scope docs;
- закрывать defect переписыванием AC задним числом без product decision;
- считать всех уведомлёнными только потому, что PR открыт;
- сохранять старое QA evidence после влияющего change без анализа regression impact;
- оставлять одновременно две противоречащие канонические версии правила.

## Минимальный change checklist

Перед завершением change ответить на применимые вопросы:

- Before / after определены?
- Причина изменения понятна?
- Canonical source определён?
- Product impact согласован?
- API impact согласован Backend / Frontend?
- DB / migration impact учтён?
- UI / design impact учтён?
- Sprint scope / dependencies актуальны?
- ADR нужен / не нужен осознанно?
- Зависимые docs / tasks обновлены?
- Implementation прошла Code Review?
- Integration повторена, если граница затронута?
- QA / regression повторены?
- Product Acceptance повторена при product impact?
- Kaiten отражает фактическое состояние?
