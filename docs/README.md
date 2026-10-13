# Инженерный справочник Takt

`/docs` — канонический проектный и инженерный справочник Takt для Product, Backend, Frontend, UX/UI, QA и совместной разработки команды.

Документация описывает **согласованные требования, контракты, архитектурные и процессные правила**. Наличие документа не означает, что соответствующая функциональность уже реализована, протестирована или принята.

Текущая поставка:

- **Sprint 1:** 03.10.2026–17.10.2026;
- **объём:** 93 SP;
- **состав:** F-01–F-08, US-01–US-03;
- **канонический scope:** [Sprint 1](sprints/sprint-01/scope.md).

## Как пользоваться справочником

Перед началом работы над задачей:

1. открыть соответствующую карточку в Kaiten;
2. определить parent User Story / Foundation и Acceptance Criteria;
3. проверить применимые Business Rules;
4. открыть architecture / API / design sources, которые затрагивает задача;
5. проверить зависимости и blockers;
6. убедиться, что задача проходит [Definition of Ready](process/definition-of-ready-done.md#definition-of-ready).

Не использовать `/docs` как замену фактическому task state в Kaiten.

Не использовать Kaiten / PR / комментарий как замену каноническому requirement или API contract.

# Источники истины

## По содержанию

| Информация | Канонический источник |
| --- | --- |
| Назначение продукта и пользователи | [Product overview](product/overview.md) |
| Product scope / boundaries / future areas | [Scope and boundaries](product/scope-and-boundaries.md) |
| Термины | [Glossary](glossary.md) |
| Business Rules | [Business Rules](requirements/business-rules.md) |
| Решённые Q, активные implementation choices I-* и future decisions | [Реестр решений](requirements/business-rules.md#решения-по-прежним-q) и [открытые решения](requirements/business-rules.md#открытые-решения) |
| Архитектурный baseline | [Architecture overview](architecture/overview.md) и профильные architecture pages |
| Существенные architecture decisions | [ADR registry](architecture/decisions/README.md) и принятые ADR |
| Общие HTTP / DTO / time conventions | [API conventions](api/conventions.md) |
| Authentication / trusted context | [Authentication](api/authentication.md) |
| Error model | [Errors](api/errors.md) |
| Конкретные операции Sprint 1 | [API contracts Sprint 1](api/contracts/sprint-01.md) |
| Sprint Goal / Foundation / User Stories / AC / out-of-scope | [Sprint 1 scope](sprints/sprint-01/scope.md) |
| Development flow | [Development workflow](process/development-workflow.md) |
| Ready / Done gates | [DoR / DoD](process/definition-of-ready-done.md) |
| Git / PR workflow | [Branching and PR](process/branching-and-pr.md) |
| Code Review | [Code Review](process/code-review.md) |
| QA / defects / Product Acceptance | [QA and Product Acceptance](process/qa-and-acceptance.md) |
| Изменение согласованного baseline | [Change Management](process/change-management.md) |
| Конкретная Technical Task | Kaiten + [Technical Task template](templates/technical-task.md) |
| Внешние project resources | [Project links](product/project-links.md) |

## По системам

| Система | Что в ней канонично |
| --- | --- |
| `/docs` в Git repository | Product / BR / architecture / API / process / Sprint scope rules |
| Kaiten | Product Backlog, Sprint Backlog, Technical Tasks, defects, owner / reviewer, SP, dependencies, blockers и фактический workflow status |
| GitHub | Код, branches, commits, Pull Requests, Code Review и история изменений |
| Google Docs | Формальные учебные planning / reporting artifacts |
| Figma | Утверждённый UI/UX после появления и согласования соответствующего design artifact |
| Miro | Lean Canvas, схемы и согласованные визуальные материалы |
| Runtime OpenAPI | Фактическая schema реализованного Backend API; должна соответствовать утверждённому contract |
| TestRail | Reusable test cases / test runs только после фактического принятия инструмента командой |

URL и статус внешних ресурсов собраны в [project-links.md](product/project-links.md).

## Contract vs implementation

API contract в `/docs` описывает **согласованное внешнее поведение**.

Runtime OpenAPI и фактический HTTP exchange показывают **реализацию**.

Если они расходятся без согласованного change:

```text
contract ≠ implementation
```

это defect / unsynchronized change, а не автоматическое изменение requirement.

# Начать по роли

| Роль | Рекомендуемый порядок чтения |
| --- | --- |
| Product Owner / Analyst | [Product](product/overview.md) → [Boundaries](product/scope-and-boundaries.md) → [Glossary](glossary.md) → [BR](requirements/business-rules.md) → [Sprint 1](sprints/sprint-01/scope.md) → [QA / Acceptance](process/qa-and-acceptance.md) |
| Backend | [Sprint 1](sprints/sprint-01/scope.md) → [BR](requirements/business-rules.md) → [Architecture](architecture/overview.md) → [Backend](architecture/backend.md) → [Data model](architecture/data-model.md) → [API conventions](api/conventions.md) → [Authentication](api/authentication.md) → [Errors](api/errors.md) → [Contracts](api/contracts/sprint-01.md) |
| Frontend | [Sprint 1](sprints/sprint-01/scope.md) → [BR](requirements/business-rules.md) → [Frontend](architecture/frontend.md) → [Integration](architecture/integration.md) → [API conventions](api/conventions.md) → [Authentication](api/authentication.md) → [Errors](api/errors.md) → [Contracts](api/contracts/sprint-01.md) |
| UX/UI | [Product](product/overview.md) → [Boundaries](product/scope-and-boundaries.md) → [Sprint 1](sprints/sprint-01/scope.md) → [Glossary](glossary.md) → [BR](requirements/business-rules.md) → [Project / design resources](product/project-links.md) |
| QA | [Sprint 1](sprints/sprint-01/scope.md) → [BR](requirements/business-rules.md) → [API conventions](api/conventions.md) → [Authentication](api/authentication.md) → [Errors](api/errors.md) → [Contracts](api/contracts/sprint-01.md) → [QA / Acceptance](process/qa-and-acceptance.md) → [Bug Report](templates/bug-report.md) |
| Scrum Master / process | [Development workflow](process/development-workflow.md) → [DoR / DoD](process/definition-of-ready-done.md) → [Branching / PR](process/branching-and-pr.md) → [Code Review](process/code-review.md) → [QA / Acceptance](process/qa-and-acceptance.md) → [Change Management](process/change-management.md) |

Общие зоны ответственности команды находятся в [Product overview](product/overview.md#ответственность-команды).

Конкретные owner / reviewer / QA / Product Acceptance / SP / dependencies определяются Sprint Planning / Kaiten и не выводятся автоматически из этой таблицы.

# Навигация по теме

## Product

- [Product overview](product/overview.md)
- [Scope and boundaries](product/scope-and-boundaries.md)
- [Project resources](product/project-links.md)
- [Glossary](glossary.md)

## Requirements

- [Business Rules and decisions](requirements/business-rules.md)

## Architecture

- [Overview](architecture/overview.md)
- [Backend](architecture/backend.md)
- [Frontend](architecture/frontend.md)
- [Integration](architecture/integration.md)
- [Data model](architecture/data-model.md)
- [Architecture decisions / ADR](architecture/decisions/README.md)

## API

- [Conventions](api/conventions.md)
- [Authentication](api/authentication.md)
- [Errors](api/errors.md)
- [Sprint 1 contracts](api/contracts/sprint-01.md)

## Process

- [Development workflow](process/development-workflow.md)
- [Definition of Ready / Definition of Done](process/definition-of-ready-done.md)
- [Branching and Pull Requests](process/branching-and-pr.md)
- [Code Review](process/code-review.md)
- [QA and Product Acceptance](process/qa-and-acceptance.md)
- [Change Management](process/change-management.md)

## Sprint

- [Sprint 1 scope](sprints/sprint-01/scope.md)

## Templates

- [Technical Task](templates/technical-task.md)
- [API contract](templates/api-contract.md)
- [Bug Report](templates/bug-report.md)
- [ADR](templates/adr.md)

# Связи между каноническими документами

Основная цепочка для продуктового поведения:

```text
Product
→ Sprint scope / Acceptance Criteria
→ Business Rules
→ API / Design / Data contracts
→ Technical Tasks
→ Implementation
→ Integration
→ QA
→ Product Acceptance
```

Основная цепочка для API:

```text
BR / AC
→ API contract
→ Backend implementation + OpenAPI
→ Frontend API-layer
→ Integration
→ QA
```

Основная цепочка для persisted data:

```text
BR / architecture
→ data-model.md
→ migration / ORM / persistence
→ API contract, если внешний exchange затронут
→ tests / QA
```

Если одна часть цепочки меняется, проверить зависимые артефакты по [Change Management](process/change-management.md).

# Актуальность, blockers и TBD

## Product blockers

Активные продуктовые blockers определяются только в [реестре открытых решений](requirements/business-rules.md#открытые-решения).

Решённый исторический Q не является активным blocker.

## Implementation choices

I-* обозначают неблокирующие product scope технические выборы, которые должны быть уточнены соответствующим owner до их реализации / DoD.

Само наличие I-*:

- не означает неизвестное продуктовое поведение;
- не делает API contract автоматически blocked;
- не отменяет обычный DoR;
- не требует ADR автоматически.

Если implementation choice становится существенным architecture decision, применяется [ADR process](architecture/decisions/README.md#когда-нужен-adr).

## Future scope

Future-scope decision не используется как обязательное требование Sprint 1 без отдельного согласованного change.

# Если документы противоречат друг другу

Не выбирать удобную трактовку самостоятельно.

Порядок:

1. зафиксировать конкретное противоречие;
2. определить канонический источник соответствующего решения;
3. подключить применимых участников;
4. согласовать корректное состояние;
5. обновить canonical source;
6. синхронизировать зависимые docs / tasks / tests;
7. повторить затронутые review / integration / QA.

Типовые escalation rules:

- product behavior / scope / AC / BR → Product Owner;
- cross-component API → Backend + Frontend, Product Owner при изменении product semantics;
- architecture → применимые technical owners, ADR если решение существенное;
- QA finding с неизвестным expected behavior → requirement clarification, а не самостоятельный выбор QA;
- Sprint scope change → Product Owner + команда + Sprint Planning / Kaiten.

Полный порядок — [Change Management](process/change-management.md).

# Документация и статус реализации

Документация может описывать целевой согласованный результат раньше реализации.

Поэтому формулировки вида:

```text
endpoint должен возвращать ...
```

не означают:

```text
endpoint уже реализован и проверен.
```

Фактическая готовность определяется через:

- task state в Kaiten;
- code / PR state в GitHub;
- применимые tests;
- Integration evidence;
- QA evidence;
- Product Acceptance;
- [Definition of Done](process/definition-of-ready-done.md).

Нельзя использовать наличие документа как evidence завершённой реализации.

# Внешние ресурсы

Ссылки на GitHub, Kaiten, Miro, Google Docs, будущий Figma и другие принятые инструменты находятся в [Project links](product/project-links.md).

Ожидаемый Figma / UI/UX artifact ведётся как [L-04](product/project-links.md#ожидаемые-ресурсы).

TestRail добавляется как проектный ресурс только после фактического принятия и настройки командой.
