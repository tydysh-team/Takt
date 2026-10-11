# Шаблон Technical Task

[К справочнику](../README.md) · [Workflow](../process/development-workflow.md) · [DoR / DoD](../process/definition-of-ready-done.md) · [Change Management](../process/change-management.md) · [API contract template](api-contract.md)

## Как использовать

Скопировать применимые разделы в карточку Technical Task либо в связанный документ задачи.

Если задача ведётся в Kaiten, **Kaiten остаётся каноническим источником фактического статуса, owner / reviewer, Story Points, зависимостей и blockers**. Внешний документ не должен молча расходиться с карточкой.

Правила заполнения:

- заменить инструкции конкретным проверяемым содержанием;
- удалить placeholder-текст после заполнения;
- неприменимый раздел отметить `N/A` с краткой причиной;
- неизвестное обязательное значение связать с конкретным blocker;
- не объявлять решённый исторический Q активным blocker;
- не переносить future-scope вопрос в текущую задачу без отдельного change;
- не копировать большие фрагменты canonical docs — давать ссылку и фиксировать только task-specific impact.

Technical Task описывает **работу и проверяемый результат**, а не пользовательскую ценность вместо parent User Story.

# Карточка

| Поле | Что указать |
| --- | --- |
| ID | ID Technical Task в Sprint Planning / Kaiten |
| Название | Краткий проверяемый технический результат |
| Тип | Backend / Frontend / DB / Integration / Documentation / Design / QA / Infrastructure / другой фактический тип |
| Parent | User Story либо Foundation ID + ссылка; `N/A` только с причиной |
| Owner | Назначенный исполнитель |
| Reviewer | Назначенный reviewer |
| QA | Назначенный QA либо `N/A` с причиной |
| Product Acceptance | Применимость и назначенный Product Owner / `N/A` с причиной |
| Story Points | Согласованная оценка либо ссылка на planning |
| Dependencies | Конкретные prerequisite tasks / artifacts |
| Blockers | Активные blockers либо `None` |
| Links | Kaiten, canonical docs, design, PR, evidence |

Назначения и Story Points не выводятся автоматически из общей ownership-области команды.

# Цель

Кратко описать:

- какой технический результат должен появиться;
- зачем он нужен parent User Story / Foundation;
- по какому observable result можно понять, что задача выполнена.

Не использовать формулировку уровня «сделать Backend» без проверяемого результата.

# Контекст

Указать только необходимый context:

- текущее состояние;
- проблему / ограничение;
- уже принятые решения;
- связанные canonical documents;
- важные технические предпосылки.

Если решение уже зафиксировано в BR / architecture / API docs, дать ссылку вместо создания второй версии правила.

# Scope

Перечислить конкретные результаты, которые входят в задачу.

Пример структуры:

- [ ] реализовать ...
- [ ] обновить ...
- [ ] добавить ...
- [ ] проверить ...
- [ ] синхронизировать документацию ...

Для technology-choice task в scope включить:

- сам выбор;
- критерии выбора;
- проверку совместимости;
- фиксацию решения в применимом canonical source / ADR, если ADR действительно требуется.

# Out of scope

Явно перечислить соседние работы, которые **не являются** Acceptance Criteria этой задачи.

Не использовать out-of-scope для исключения обязательной части parent scope или DoD.

# Зависимости и blockers

Для каждой зависимости указать:

| Dependency / blocker | Что именно требуется | Статус / источник |
| --- | --- | --- |
| `<ID / artifact>` | `<результат prerequisite>` | `<Ready / Blocked / ссылка>` |

Если задача зависит от [реестра решений](../requirements/business-rules.md#открытые-решения), указать:

- ID;
- класс: `блокирует разработку` / `неблокирующий выбор реализации` / `будущий scope`;
- влияние на эту задачу;
- кто уточняет решение;
- когда оно должно быть определено.

Правила:

- активный product blocker нельзя заменить самостоятельным предположением разработчика;
- I-* implementation choice может входить в scope задачи, если внешний product / API contract уже определён;
- исторически решённый Q не остаётся blocker;
- future-scope вопрос не является prerequisite текущего Sprint 1 без отдельного change.

# Применимые требования и Business Rules

Указать ссылки на:

- parent Acceptance Criteria;
- применимые BR;
- Sprint scope;
- другие обязательные product rules.

Для каждого важного BR коротко указать, **какая часть этой задачи его реализует или проверяет**.

Если задача не затрагивает Business Rules, написать `N/A` и причину.

# Architecture impact

Указать:

- затронутые modules / layers;
- изменяется ли dependency direction;
- появляется ли новая public / internal boundary;
- требуется ли изменение architecture docs;
- нужен ли ADR.

Если architecture baseline не меняется, достаточно указать это явно.

# API impact

Если API не затрагивается:

`N/A — public HTTP contract не меняется.`

Если затрагивается, указать ссылку на утверждённый contract и перечислить применимые изменения:

- method / path;
- authentication / role;
- path / query parameters;
- request DTO;
- response DTO;
- required / nullable semantics;
- success HTTP status;
- error statuses / stable `error.code`;
- sorting;
- time semantics;
- compatibility / breaking impact;
- Backend / Frontend consumers.

Для нового или изменённого endpoint использовать [API contract template](api-contract.md).

Backend и Frontend не определяют неизвестные части одного contract независимо друг от друга.

# Authentication / authorization impact

Указать по применимости:

- какая роль выполняет операцию;
- как определяется current Account / domain profile;
- проверяется ли ownership / relation;
- какие client-supplied IDs являются target resource, а какие **не могут** определять identity;
- ожидаемые `401 / 403 / concealed 404` cases.

Frontend guard не заменяет Backend authorization.

Если auth не затрагивается — `N/A` с причиной.

# Data / persistence impact

Если persistence не затрагивается:

`N/A — persisted model не меняется.`

Если затрагивается, указать:

- entities / fields / relations;
- foreign keys / unique constraints / другие invariants;
- нужна ли Alembic migration;
- поведение существующих данных;
- transaction / atomicity expectations;
- seed / demo data impact;
- test fixtures impact;
- rollback / failure considerations;
- API impact, если data change выходит наружу.

Новое доменное поле / relation требует product или architecture основания; удобство ORM само по себе не является основанием.

# UI / UX impact

Если UI не затрагивается:

`N/A — пользовательский интерфейс не меняется.`

Если затрагивается, указать:

- screen / feature;
- user action;
- required data;
- `loading / empty / error / success`;
- submit / retry behavior;
- role-specific behavior;
- human-readable labels;
- date / time behavior;
- stale response handling, если применимо;
- ссылку на утверждённый design source.

Frontend не придумывает отсутствующий Backend DTO или product behavior внутри task implementation.

# Acceptance Criteria

Каждый AC должен быть проверяемым.

Рекомендуемый формат:

```text
AC-1
Given ...
When ...
Then ...
```

Либо короткий эквивалент, если Given / When / Then избыточны.

Включить по применимости:

- happy path;
- validation;
- authentication;
- authorization;
- чужие / отсутствующие resources;
- boundary values;
- persistence result;
- error response;
- empty state;
- UI states;
- integration behavior;
- regression-sensitive cases.

Acceptance Criteria Technical Task должны поддерживать parent AC, а не незаметно менять их.

Не фиксировать зависимый от unresolved blocker результат как уже утверждённый.

# План проверок и evidence

До начала реализации указать, какие проверки понадобятся.

| Уровень | Что проверяется | Evidence |
| --- | --- | --- |
| Unit | `<если применимо>` | `<test / command / result>` |
| API | `<если применимо>` | `<test / HTTP evidence>` |
| Persistence | `<если применимо>` | `<migration / DB test>` |
| Integration | `<если применимо>` | `<real HTTP flow>` |
| Frontend / UI | `<если применимо>` | `<manual / automated evidence>` |
| QA | `<AC / BR / regression>` | `<run / checklist / link>` |

Не писать только «всё протестировано».

Для time-dependent behavior перечислить конкретные boundaries.

Для auth-dependent behavior перечислить роли / permission cases.

Mocks могут подтверждать локальную разработку, но не заменяют real integration evidence там, где Integration применима.

# Definition of Ready check

Перед переводом задачи в активную разработку сверить [общий DoR](../process/definition-of-ready-done.md#definition-of-ready).

Task-specific подтверждение:

- [ ] scope понятен;
- [ ] AC проверяемы;
- [ ] owner / reviewer назначены;
- [ ] dependencies известны;
- [ ] активные blockers отсутствуют;
- [ ] применимые BR / API / design определены;
- [ ] data / migration impact понятен;
- [ ] test / evidence plan понятен.

Отметка этого списка не заменяет полный общий DoR.

# Task-specific Definition of Done

Применяется [общий DoD](../process/definition-of-ready-done.md#definition-of-done).

Здесь указать только дополнительные task-specific условия, например:

- [ ] конкретная migration проверена;
- [ ] конкретный endpoint отражён в OpenAPI;
- [ ] конкретный integration flow подтверждён;
- [ ] конкретная документация обновлена.

Для неприменимых общих DoD-пунктов зафиксировать причину.

Не копировать весь общий DoD и не ослаблять его локально.

# Change impact во время выполнения

Если после Ready меняются requirement / contract / design / data model / dependency:

1. описать before / after;
2. применить [Change Management](../process/change-management.md);
3. обновить canonical source;
4. повторно проверить DoR;
5. определить, какие review / tests / QA evidence стали неактуальны.

Нельзя продолжать по старой спецификации и одновременно считать новую договорённость действующей.

# Результат выполнения

Заполняется **после реализации**, а не как план.

Указать:

- branch / commit / PR;
- что фактически реализовано;
- отклонения от первоначального scope;
- какие canonical docs обновлены;
- выполненные tests / commands;
- integration evidence;
- известные limitations / follow-up items.

Если фактический результат отличается от согласованного scope, должна быть ссылка на соответствующий change.

# Результаты Review / QA / Product Acceptance

Заполняется после соответствующих этапов.

## Code Review

- версия / commit:
- reviewer:
- результат: `Approved / Changes required`;
- существенные замечания:
- повторный review после изменений:

## Integration

- версия / commit:
- проверенный flow:
- результат:
- evidence:

## QA

- версия / build:
- результат: `PASS / FAIL / BLOCKED`;
- defects:
- retest:
- regression evidence:

## Product Acceptance

- версия / build:
- результат: `Accepted / Returned / Change requested / N/A`;
- комментарий / причина:

До фактического прохождения этапа этот раздел не должен создавать впечатление, что проверка уже выполнена.
