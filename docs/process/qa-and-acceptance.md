# QA и Product Acceptance

[К справочнику](../README.md) · [Workflow](development-workflow.md) · [DoR / DoD](definition-of-ready-done.md) · [Code Review](code-review.md) · [Bug report](../templates/bug-report.md) · [API contracts](../api/contracts/sprint-01.md)

## Назначение

QA проверяет, что реализованный результат соответствует согласованным Acceptance Criteria, Business Rules, API contracts и затронутому regression scope.

Product Acceptance проверяет, что пользовательский результат соответствует согласованному продуктовым scope и может быть принят Product Owner.

QA, Code Review и Product Acceptance не являются взаимозаменяемыми этапами:

- Code Review проверяет техническую корректность изменения;
- Integration подтверждает работу затронутых системных границ;
- QA проверяет поведение по требованиям и негативные / граничные сценарии;
- Product Acceptance подтверждает продуктовый результат.

Один участник может выполнять несколько ролей, но evidence и критерии каждой проверки должны оставаться различимыми.

## Основа QA

QA не придумывает ожидаемое поведение самостоятельно.

Источники ожидаемого результата используются совместно. Порядок ниже помогает найти наиболее scenario-specific спецификацию, но не даёт одному источнику права молча переопределять другой:

1. Acceptance Criteria соответствующей User Story / Foundation / Technical Task;
2. подтверждённые Business Rules;
3. утверждённый API contract;
4. применимые architecture / data / UI rules;
5. явно согласованные решения в текущей задаче / change record.

Если источники противоречат друг другу, QA не выбирает удобную трактовку. Несогласованность фиксируется как blocker документации / требований и возвращается на уточнение.

Неблокирующий implementation detail проверяется только в той степени, в которой он влияет на observable behavior, безопасность, данные или agreed technical contract.

## Подготовка к проверке

Перед началом QA должны быть известны по применимости:

- проверяемая задача / User Story / Foundation;
- актуальные AC;
- применимые BR;
- API contract;
- branch / commit / merged revision;
- окружение;
- используемые demo / test data;
- auth role / account context;
- внешние зависимости;
- известные limitations;
- ожидаемый набор проверок;
- фактический build / version, на котором выполняется QA.

QA evidence без указания проверяемой версии нельзя считать воспроизводимым.

Если изменение после начала QA затронуло проверяемое поведение, применимые проверки выполняются повторно на актуальной версии.

## Минимальная структура QA evidence

Для ручной проверки либо test run фиксируются:

- что проверяется;
- source requirement / AC / BR / contract;
- environment;
- branch / commit / build;
- test data / account role;
- шаги или достаточно точное описание действия;
- expected result;
- actual result;
- итог `PASS / FAIL / BLOCKED`;
- приложенный evidence при необходимости.

`BLOCKED` означает, что проверка не может быть завершена из-за внешней причины / зависимости. Он не равен `PASS` и не должен скрываться как успешная проверка.

## Обязательные классы проверок

Набор ниже применяется по смыслу конкретной задачи.

### Positive path

Проверить основной успешный сценарий:

- операция доступна допустимой роли;
- корректный request принимается;
- данные сохраняются / возвращаются ожидаемо;
- UI отображает требуемый результат;
- последующие связанные сценарии видят обновлённое состояние.

Успешный HTTP status без проверки результата в persistence / dependent read scenario недостаточен там, где AC требует сохранение данных.

### Validation

Проверить применимые transport / field validation cases:

- missing required field;
- unexpected field;
- invalid type;
- invalid UUID;
- invalid email;
- invalid / naive date-time;
- min / max length;
- invalid enum / role value;
- пустое значение после нормализации / trim, если применимо.

Для API проверяются HTTP status, `error.code`, `details` и отсутствие framework default shape.

### Authentication и authorization

Проверить по применимости:

- отсутствующий credential;
- невалидный / истёкший credential;
- неверная роль;
- попытка получить / изменить чужой ресурс;
- подмена client-side Account / Teacher / Student ID;
- отсутствие утечки существования защищённого ресурса там, где contract требует единый `404`.

Frontend hiding / router guard не считается доказательством Backend authorization.

### Business Rules

QA строит отдельные проверки для применимых BR, особенно если правило не полностью покрывается schema validation.

Для Sprint 1 минимум:

- Teacher создаёт Lesson только от собственного authenticated context;
- Student должен быть связан с текущим Teacher;
- Lesson creation атомарна;
- `starts_at >= now`;
- Student upcoming содержит только собственные Lesson;
- upcoming использует `starts_at >= now`;
- upcoming сортируется `starts_at ASC, id ASC`;
- Teacher calendar использует `[from, to)`;
- один Account имеет одну роль и один соответствующий profile;
- registration использует `email / password / role / display_name`;
- `display_name` используется как человекочитаемая подпись;
- UI работает в browser-local timezone по BR-12.

### Boundary testing

Граничные значения обязательны там, где правило зависит от границы.

Для времени Sprint 1 проверить как минимум:

- `starts_at < now`;
- `starts_at == now`;
- `starts_at > now`;
- `starts_at == from`;
- `from < starts_at < to`;
- `starts_at == to`;
- `from >= to`;
- эквивалентные абсолютные моменты с разными offsets;
- локальные календарные границы недели;
- переход UTC offset / DST, если окружение позволяет воспроизвести соответствующую timezone.

`now` в boundary tests должен быть управляемым / фиксированным настолько, чтобы тест был воспроизводим.

### Empty state

Для collection endpoints и UI проверить:

- HTTP `200`;
- пустой массив `[]`;
- корректный empty UI state;
- отсутствие ложной `404`.

### Error handling

Проверить:

- ожидаемый HTTP status;
- зарегистрированный `error.code`;
- безопасный `message`;
- корректный `details` для field errors;
- отсутствие stack trace / SQL / secrets / constraint names;
- Frontend branch по status / code, а не по тексту `message`;
- неизвестный code / transport error обрабатывается безопасно.

### UI states

По применимости проверить:

- loading;
- empty;
- error;
- success;
- submit / disabled state;
- повторное действие;
- stale response protection;
- role-specific navigation / visibility;
- human-readable labels вместо UUID;
- browser-local date-time display.

UI validation является UX-проверкой и не заменяет Backend validation.

### Integration

Если задача затрагивает Frontend ↔ Backend boundary, mock-only проверка недостаточна.

Минимально проверить реальный HTTP flow:

- Frontend использует корректный Backend origin / `/api/v1`;
- CORS не блокирует допустимый origin;
- Bearer header передаётся через API-layer;
- DTO соответствует contract;
- ErrorDTO корректно читается Frontend;
- identity определяется Backend;
- date-time roundtrip сохраняет абсолютный момент;
- UI корректно обрабатывает empty / error / success.

Для Sprint 1 основной сквозной сценарий:

```text
Teacher login
→ получить доступных Students
→ создать Lesson
→ Lesson сохранён
→ Student видит его в upcoming при выполнении BR-05
→ Teacher видит его в calendar при попадании в [from, to)
```

### Regression

Regression scope определяется влиянием изменения.

Минимально перепроверяются:

- непосредственно изменённый сценарий;
- зависимые API / UI consumers;
- permissions;
- persistence behavior;
- общий error handling, если изменён ErrorDTO / exception mapping;
- time behavior, если изменена date-time logic.

Не нужно прогонять весь продукт без причины, но нельзя ограничиваться только строкой, которую исправляли, если изменение затронуло общий компонент.

## Автоматизация

Для Backend применяется `pytest` и подходящие уровни tests согласно architecture:

- unit;
- API;
- persistence;
- integration.

Frontend automation / E2E вводится по необходимости и в рамках отдельного technical scope.

Наличие automated test не отменяет ручную проверку пользовательского результата там, где она необходима для Product Acceptance.

Ручной test не заменяет обязательный automated regression test, если он входит в согласованный scope задачи / DoD.

## Defect vs change request

Дефект существует, если фактическое поведение расходится с уже согласованным ожидаемым поведением:

- AC;
- BR;
- API contract;
- утверждённым design / process rule;
- иным каноническим source.

Новое пожелание, которого не было в согласованном scope, не объявляется дефектом автоматически.

Если во время QA обнаружена неоднозначность requirement, это сначала вопрос на уточнение, а не попытка выбрать трактовку через severity.

## Severity

Severity описывает влияние дефекта на систему / пользователя, а не желаемый срок исправления.

| Severity | Критерий |
| --- | --- |
| `Blocker` | Невозможно продолжить критичную проверку / сценарий без обходного пути либо результат спринта принципиально непроверяем |
| `Critical` | Потеря / повреждение данных, серьёзное нарушение authorization / confidentiality, тяжёлый отказ ключевого сценария |
| `Major` | Существенное нарушение Acceptance Criteria или основного поведения; сценарий сломан полностью либо имеет ограниченный workaround |
| `Minor` | Ограниченное визуальное / текстовое / локальное отклонение, не разрушающее основной согласованный сценарий |

Severity не снижается только потому, что исправление неудобно или не помещается по времени.

Priority — отдельное управленческое решение о порядке исправления. Она определяется командой / Product Owner с учётом severity, Sprint Goal, зависимостей и стоимости задержки.

## Когда дефект блокирует Done

Следующие случаи несовместимы с Done соответствующей задачи:

- Blocker;
- Critical;
- Major, нарушающий Acceptance Criteria;
- defect, нарушающий authorization / data integrity;
- известное расхождение фактического API с утверждённым contract;
- defect, делающий Product Acceptance невозможной.

Minor либо иной неблокирующий дефект допускается только по правилам DoD: отдельная карточка, честно зафиксированный impact и согласованное решение применимых участников.

## Жизненный цикл дефекта

Логический lifecycle:

```text
Registered
→ Triage
→ Assigned
→ In progress
→ Ready for retest
→ Retest
→ Closed
```

Если defect воспроизводится после исправления:

```text
Retest → Reopened
```

Это логическая модель и не требует создания отдельных Kaiten columns для каждого состояния.

При triage уточняются:

- reproducibility;
- affected scope;
- severity;
- priority;
- owner;
- dependency / blocker impact;
- duplicate status;
- необходимость product clarification.

## Bug report

Bug report оформляется по [шаблону](../templates/bug-report.md) и содержит минимум:

- краткий понятный title;
- environment;
- branch / commit / build;
- preconditions;
- steps;
- expected result;
- actual result;
- reproducibility;
- severity;
- evidence;
- affected task / US / BR / API contract;
- дополнительные диагностические данные без secrets.

Для API-defect желательно приложить:

- method / path;
- sanitized request;
- HTTP status;
- sanitized response;
- relevant `error.code`.

Не прикладывать реальные passwords, Bearer tokens, private data или server secrets.

## Retest

Retest выполняется на версии, содержащей заявленное исправление.

QA проверяет:

1. исходный defect case;
2. ожидаемый исправленный результат;
3. применимую regression затронутого поведения.

Автор исправления не заменяет QA retest сообщением «у меня работает».

Если QA и автор исправления — один человек по фактическому назначению, evidence всё равно должно позволять независимо понять, что именно было проверено и на какой версии.

Duplicate / rejected / cannot reproduce закрываются только с причиной и достаточным context.

## Product Acceptance

Product Acceptance выполняется после применимой QA либо на этапе, определённом workflow для конкретной задачи.

Product Owner проверяет:

- достигнут ли ожидаемый пользовательский результат;
- соблюдены ли согласованные границы scope;
- отсутствуют ли незакрытые продуктовые blockers;
- понятны ли известные defects / limitations;
- не подменён ли Acceptance Criterion другим технически удобным поведением.

Результат Product Acceptance:

- **Accepted** — пользовательский результат принят в текущем scope;
- **Returned** — есть конкретное несоответствие согласованному result / AC;
- **Change requested** — возникло новое пожелание вне старого scope.

`Change requested` не превращает корректную старую реализацию в defect автоматически.

Для чисто технической / документационной задачи Product Acceptance может быть `N/A`, если это соответствует задаче и зафиксирована причина.

## Evidence Product Acceptance

По применимости фиксируется:

- проверяемая User Story / task;
- версия / build;
- сценарий;
- результат;
- известные неблокирующие defects;
- решение Product Owner.

Product Acceptance не заменяется фактом merge PR или сообщением «QA passed».

## TestRail

TestRail не является обязательным инструментом до его фактического принятия / настройки командой.

Если TestRail будет использоваться:

- переиспользуемые test cases и test runs могут храниться там;
- Kaiten продолжает хранить фактическое task / defect state;
- `/docs` хранит process rules, а не дублирует все test cases;
- карточки / PR содержат ссылки на relevant TestRail evidence;
- один и тот же набор тестов не копируется вручную в несколько источников без необходимости.

## Завершение QA

QA для задачи считается завершённой, когда:

- все обязательные проверки выполнены;
- результаты относятся к актуальной версии;
- FAIL cases зарегистрированы как defects;
- исправленные blocking defects прошли retest;
- применимая regression выполнена;
- blockers явно отражены;
- evidence достаточно для повторного понимания результата;
- фактический статус синхронизирован с Kaiten.

`QA complete` не означает автоматически `Done`, если остаются незавершённые Product Acceptance или другие применимые пункты Definition of Done.
