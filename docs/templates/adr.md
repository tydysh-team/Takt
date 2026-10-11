# Шаблон ADR

[К справочнику](../README.md) · [Реестр ADR](../architecture/decisions/README.md) · [Architecture overview](../architecture/overview.md) · [Change Management](../process/change-management.md) · [Technical Task](technical-task.md)

## Как использовать

ADR (`Architecture Decision Record`) создаётся только для **существенного технического решения**, которое соответствует критериям из [реестра ADR](../architecture/decisions/README.md#когда-нужен-adr).

ADR нужен, если решение, например:

- меняет утверждённый architecture baseline;
- имеет несколько реалистичных альтернатив с существенно разными последствиями;
- создаёт долгосрочное ограничение / dependency;
- влияет сразу на несколько частей системы;
- должно оставаться объяснимым после завершения текущей задачи / Sprint.

ADR **не нужен** только ради:

- отдельного DTO-поля;
- локального refactoring;
- небольшой implementation detail;
- легко заменяемого выбора без архитектурных последствий;
- самого факта наличия I-* implementation choice.

Если I-* в ходе уточнения становится существенным архитектурным выбором, он оформляется ADR до завершения соответствующей реализации.

Правила:

- заменить placeholder-текст фактическим содержанием;
- не выдумывать альтернативы, которые реально не рассматривались;
- не отмечать ADR `принято` до фактического согласования;
- принятое решение не переписывать задним числом;
- при существенной смене решения создать новый ADR и связать его с предыдущим;
- ADR объясняет **почему** принято решение, но не заменяет Business Rule, API contract, architecture page или Technical Task.

Файл именуется:

```text
NNNN-краткая-тема.md
```

Номер ADR не переиспользуется.

E-ID из architecture registry (`E-01`, `E-02` и т.д.) **не является номером ADR**.

# Карточка

| Поле | Значение |
| --- | --- |
| ADR | `ADR-NNNN — <название>` |
| Файл | `NNNN-краткая-тема.md` |
| Статус | `предложено / принято / отклонено / заменено` |
| Дата предложения | `<YYYY-MM-DD>` |
| Дата решения | `<YYYY-MM-DD / TBD>` |
| Автор | `<инициатор решения>` |
| Technical participants | `<фактические owners / reviewers>` |
| Product Owner | `<участвует при product / BR / AC / API-semantic impact; иначе N/A>` |
| Связанная задача | `<Kaiten / Technical Task / PR>` |
| Заменяет | `<ADR-NNNN / N/A>` |
| Заменён | `<ADR-NNNN / N/A>` |
| Canonical docs affected | `<architecture / API / BR / process links>` |

Статус должен соответствовать lifecycle из ADR registry.

# Статус и история

## Текущий статус

```text
<предложено / принято / отклонено / заменено>
```

## История статуса

| Дата | Статус | Причина / ссылка |
| --- | --- | --- |
| `<date>` | `предложено` | `<создано для review>` |
| `<date>` | `<принято / отклонено / заменено>` | `<решение / ссылка>` |

История нужна только для значимых переходов статуса, а не для каждого edit.

Принятый ADR не редактируется так, чтобы изменить смысл первоначально принятого решения.

Допустимы последующие технические правки без изменения смысла:

- исправление typo;
- обновление сломанной ссылки;
- добавление ссылки на заменяющий ADR;
- уточнение metadata, не меняющее decision.

Если меняется само решение — создаётся новый ADR.

# Контекст

Описать:

- какую проблему необходимо решить;
- почему решение требуется сейчас;
- текущее состояние системы;
- ограничения;
- применимые product / BR / API / architecture requirements;
- что произойдёт, если решение не принять.

Контекст должен позволять понять решение человеку, который не участвовал в исходном обсуждении.

Не смешивать:

- факт;
- assumption;
- open question.

Если assumption существенно влияет на выбор, указать его явно.

# Decision drivers

Перечислить реальные критерии, по которым сравниваются варианты.

Примеры категорий, только если применимы:

- соответствие текущему architecture baseline;
- сложность реализации;
- стоимость сопровождения;
- безопасность;
- data integrity;
- testability;
- compatibility;
- developer experience;
- performance;
- operational complexity;
- возможность локальной разработки;
- vendor / library lock-in;
- migration cost;
- соответствие Sprint scope.

Не добавлять критерии, которые не участвовали в решении, только для полноты документа.

# Рассмотренные варианты

Зафиксировать **реально рассмотренные** варианты.

## Option A — `<название>`

### Суть

`<краткое описание>`

### Плюсы

- `<...>`

### Минусы / риски

- `<...>`

### Ограничения

- `<...>`

## Option B — `<название>`

### Суть

`<...>`

### Плюсы

- `<...>`

### Минусы / риски

- `<...>`

### Ограничения

- `<...>`

Добавить дополнительные варианты только если они действительно рассматривались.

Если вариант был отброшен до полноценного рассмотрения из-за жёсткого ограничения, это можно кратко указать с причиной.

# Решение

## Выбранный вариант

```text
<Option ...>
```

## Формулировка решения

Однозначно описать:

- что именно выбирается;
- где применяется;
- где **не** применяется;
- какие boundaries становятся обязательными;
- какие части остаются implementation detail;
- с какого момента решение считается действующим.

Формулировка должна позволять проверить implementation на соответствие ADR.

Плохо:

```text
Будем использовать более хорошую архитектуру.
```

Хорошо:

```text
Backend использует <approach> для <scope>.
Transaction boundary остаётся на уровне Service.
<Alternative behavior> в рамках данного решения не используется.
```

# Обоснование

Объяснить, почему выбранный вариант лучше других **в текущем контексте Takt**.

Связать решение с Decision drivers.

Не использовать аргумент:

```text
так привычнее
```

как единственное основание, если решение создаёт долгосрочное архитектурное ограничение.

Если решение является компромиссом, указать это прямо.

# Последствия

Последствия фиксируются как часть решения, а не только как преимущества.

## Положительные

- `<что становится проще / надёжнее / понятнее>`

## Отрицательные

- `<стоимость / ограничения / technical debt / operational impact>`

## Риски

| Риск | Вероятность / impact | Mitigation |
| --- | --- | --- |
| `<risk>` | `<qualitative>` | `<что делаем>` |

Не требуется формальная числовая risk model, если она не используется командой.

# Impact analysis

Отметить только реально затронутые области.

| Область | Impact | Что требуется |
| --- | --- | --- |
| Product / BR | `<yes/no>` | `<... / N/A>` |
| Sprint scope / AC | `<yes/no>` | `<... / N/A>` |
| Backend | `<yes/no>` | `<... / N/A>` |
| Frontend | `<yes/no>` | `<... / N/A>` |
| API contract | `<yes/no>` | `<... / N/A>` |
| Authentication / authorization | `<yes/no>` | `<... / N/A>` |
| Error model | `<yes/no>` | `<... / N/A>` |
| Data model / DB | `<yes/no>` | `<... / N/A>` |
| Migration | `<yes/no>` | `<... / N/A>` |
| UI / UX | `<yes/no>` | `<... / N/A>` |
| Integration | `<yes/no>` | `<... / N/A>` |
| QA / regression | `<yes/no>` | `<... / N/A>` |
| Local environment / tooling | `<yes/no>` | `<... / N/A>` |
| Documentation | `<yes/no>` | `<... / N/A>` |

Если ADR меняет product behavior, BR, Acceptance Criteria или внешний API-смысл, Product Owner участвует в решении.

# Compatibility / migration

Если переход не требуется:

```text
N/A — решение не требует миграции существующего состояния / consumers.
```

Если требуется, описать:

- current state;
- target state;
- affected consumers / components;
- порядок перехода;
- временную совместимость;
- data migration;
- config / environment changes;
- rollback / recovery approach;
- момент удаления временного compatibility layer.

Для breaking API change использовать также [Change Management](../process/change-management.md).

# План реализации

ADR не заменяет Technical Task, поэтому здесь фиксируется только высокоуровневый переход.

1. `<обновить canonical architecture source>`
2. `<создать / обновить Technical Tasks>`
3. `<реализовать change>`
4. `<обновить dependent contracts / migrations / UI>`
5. `<выполнить integration / QA>`
6. `<убрать transitional artifacts, если применимо>`

Детальная декомпозиция, owner, SP и фактический статус остаются в Sprint Planning / Kaiten / Technical Tasks.

# Verification

Определить, как команда поймёт, что решение реализовано корректно.

По применимости:

- architecture review;
- code review;
- automated tests;
- persistence / migration tests;
- runtime OpenAPI comparison;
- Frontend ↔ Backend integration;
- load / performance check;
- security check;
- manual QA;
- Product Acceptance.

Для каждого существенного verification point указать observable criterion.

Пример:

```text
Runtime dependency graph не содержит обратной зависимости Persistence → Service.
```

или:

```text
Frontend и Backend успешно выполняют согласованный HTTP flow
без временного mock-only contract.
```

Не писать только:

```text
всё протестировано
```

# Canonical documents to update

После принятия ADR перечислить документы, которые должны отражать **текущее действующее состояние**.

- [ ] `docs/architecture/...`
- [ ] `docs/api/...`
- [ ] `docs/requirements/...`
- [ ] `docs/process/...`
- [ ] Sprint scope / AC, если затронуты
- [ ] Technical Tasks
- [ ] другое: `<...>`

ADR не становится единственным местом, где хранится действующее правило.

Например:

- ADR объясняет **почему** выбран новый token approach;
- `authentication.md` описывает действующую auth semantics;
- API contract описывает действующий HTTP exchange.

# Open questions / dependencies

Указывать только реальные нерешённые пункты.

| ID / dependency | Класс | Что требуется | Влияние на ADR |
| --- | --- | --- | --- |
| `<I-* / task / external dependency>` | `<implementation choice / blocker>` | `<...>` | `<...>` |

Правила:

- resolved historical Q не является open question;
- future scope не должен искусственно блокировать текущий ADR;
- I-* сам по себе не требует ADR;
- если нерешённый вопрос способен изменить выбранный вариант, ADR не переводится в `принято` до достаточного разрешения этого вопроса.

Если открытых вопросов нет:

```text
Open questions: none.
```

# Решение по ADR

## Для статуса `принято`

Зафиксировать:

- кто участвовал в technical review;
- Product Owner involvement, если требовался;
- дату решения;
- ссылку на task / discussion / PR при наличии;
- какие canonical docs должны быть обновлены.

После принятия:

1. ADR регистрируется в `docs/architecture/decisions/README.md`;
2. обновляются canonical architecture / API / BR docs;
3. обновляются связанные Technical Tasks;
4. implementation и verification идут через обычный workflow.

## Для статуса `отклонено`

Указать:

- почему proposal не принят;
- какой вариант / baseline остаётся действующим;
- есть ли follow-up.

Отклонённый ADR не удаляется только ради очистки истории.

## Для статуса `заменено`

Указать:

```text
Заменён ADR-NNNN: <ссылка>
```

Новый ADR содержит обратную связь:

```text
Заменяет ADR-NNNN: <ссылка>
```

Предыдущий принятый ADR сохраняется как историческая запись.

# Финальная проверка ADR

Перед переводом в `принято` проверить:

- [ ] решение действительно требует ADR по критериям registry;
- [ ] context понятен без устного объяснения;
- [ ] Decision drivers указаны;
- [ ] реально рассмотренные alternatives зафиксированы;
- [ ] выбранный вариант сформулирован однозначно;
- [ ] consequences и risks описаны;
- [ ] impact на Product / API / DB / Frontend / QA определён;
- [ ] migration / compatibility описаны либо явно `N/A`;
- [ ] verification проверяем;
- [ ] canonical docs to update перечислены;
- [ ] активные blockers разрешены настолько, чтобы решение можно было принять;
- [ ] PO участвовал, если меняется product behavior / BR / AC / внешний API-смысл;
- [ ] ADR registry будет обновлён;
- [ ] принятое решение не пытается заменить собой BR / API contract / Technical Task.
