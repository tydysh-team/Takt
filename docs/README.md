# Инженерный справочник Takt

`/docs` — проектная и техническая документация Takt для Product, Backend, Frontend, UX/UI и QA. Здесь описываются требования и правила разработки; наличие документа не подтверждает готовность реализации. Текущая поставка — [Sprint 1](sprints/sprint-01/scope.md), 03.10.2026–17.10.2026, 93 SP: F-01–F-08 и US-01–US-03.

## Источники истины

| Информация | Канонический источник |
| --- | --- |
| Назначение / границы продукта | [Обзор](product/overview.md), [границы](product/scope-and-boundaries.md) |
| Термины | [Глоссарий](glossary.md) |
| Бизнес-правила и открытые продуктовые решения | [Реестр BR / Q](requirements/business-rules.md) |
| Инженерные соглашения и архитектура | [Архитектура](architecture/overview.md), [решения / ADR](architecture/decisions/README.md) |
| Общие API-правила / конкретные операции | [Соглашения](api/conventions.md) / [контракты Sprint 1](api/contracts/sprint-01.md) |
| Поставка спринта | [Scope Sprint 1](sprints/sprint-01/scope.md) |
| Процесс и готовность | [Workflow](process/development-workflow.md), [DoR / DoD](process/definition-of-ready-done.md) |
| Работа конкретного исполнителя | Техническая задача в Kaiten со ссылками на `/docs` и [шаблон](templates/technical-task.md) |

Распределение между системами: Git-репозиторий `/docs` — техническая и проектная спецификация; Kaiten — состояние задач, дефектов и workflow спринта; GitHub — код, ветки, PR и Code Review; Google Docs — формальные учебные и отчётные артефакты; Figma / Miro — утверждённый дизайн и диаграммы, если применимо; TestRail, если принят командой, — подробные тест-кейсы и прогоны; FastAPI OpenAPI после реализации — фактическая runtime-схема API. URL собираются в [реестре ресурсов](product/project-links.md).

Контракт в `/docs` задаёт целевое поведение, OpenAPI показывает реализацию. Расхождение — дефект или несогласованное изменение, а не автоматическая отмена требований. Не копировать одну спецификацию в несколько систем: хранить содержание в каноническом источнике, в остальных — ссылку и статус.

## Начать по роли

| Роль | Порядок чтения |
| --- | --- |
| Product / Analyst | [Продукт](product/overview.md) → [границы](product/scope-and-boundaries.md) → [BR / Q](requirements/business-rules.md) → [Sprint 1](sprints/sprint-01/scope.md) → [приёмка](process/qa-and-acceptance.md) |
| Backend | [Архитектура](architecture/overview.md) → [Backend](architecture/backend.md) → [данные](architecture/data-model.md) → [API](api/conventions.md) → [контракты](api/contracts/sprint-01.md) → [DoR / DoD](process/definition-of-ready-done.md) |
| Frontend | [Frontend](architecture/frontend.md) → [интеграция](architecture/integration.md) → [аутентификация](api/authentication.md) → [ошибки](api/errors.md) → [контракты](api/contracts/sprint-01.md) |
| UX/UI | [Продукт](product/overview.md) → [Sprint 1](sprints/sprint-01/scope.md) → [глоссарий](glossary.md) → [BR / Q](requirements/business-rules.md) → [дизайн-ресурсы](product/project-links.md) |
| QA | [Sprint 1](sprints/sprint-01/scope.md) → [BR / Q](requirements/business-rules.md) → [контракты](api/contracts/sprint-01.md) → [QA / приёмка](process/qa-and-acceptance.md) → [bug report](templates/bug-report.md) |

## Навигация по теме

- **Продукт:** [обзор](product/overview.md), [scope и границы](product/scope-and-boundaries.md), [ресурсы](product/project-links.md), [глоссарий](glossary.md).
- **Архитектура:** [обзор](architecture/overview.md), [Backend](architecture/backend.md), [Frontend](architecture/frontend.md), [интеграция](architecture/integration.md), [модель данных](architecture/data-model.md), [решения / ADR](architecture/decisions/README.md).
- **API:** [соглашения](api/conventions.md), [аутентификация](api/authentication.md), [ошибки](api/errors.md), [контракты Sprint 1](api/contracts/sprint-01.md).
- **Требования:** [бизнес-правила и решения Q](requirements/business-rules.md).
- **Разработка:** [workflow](process/development-workflow.md), [ветки и PR](process/branching-and-pr.md), [DoR / DoD](process/definition-of-ready-done.md), [Code Review](process/code-review.md), [изменения](process/change-management.md).
- **QA:** [проверка и Product Acceptance](process/qa-and-acceptance.md).
- **Спринт:** [scope Sprint 1](sprints/sprint-01/scope.md).
- **Шаблоны:** [техническая задача](templates/technical-task.md), [API-контракт](templates/api-contract.md), [ADR](templates/adr.md), [дефект](templates/bug-report.md).

## Актуальность и противоречия

Изменение начинает владелец соответствующей области. Он обновляет канонический документ, связанные контракты, задачи, критерии и тестовые материалы по [правилам изменений](process/change-management.md). Документация проходит PR и ревью вместе с изменением поведения.

При противоречии зарегистрировать расхождение, обратиться к каноническому источнику и владельцу области, получить решение и обновить зависимые материалы. Продуктовое поведение согласует Product Owner, техническую реализацию — владелец области; API согласуют Backend и Frontend. Scope спринта не переопределяет общие инженерные правила молча.

Каждый нерешённый пункт имеет ID и класс в [реестре решений](requirements/business-rules.md#открытые-решения). Полнота конкретной задачи проверяется по DoR отдельно от полноты справочника. [Недостающие проектные ссылки](product/project-links.md#missing-project-link) должен предоставить PO.
