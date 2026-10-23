# US-07 — Acceptance Criteria

## User Story

**Я как ученик хочу видеть актуальный статус занятия, чтобы понимать, запланировано оно, идёт, завершено, перенесено или отменено.**

---

## AC-US07-01 — Planned до начала занятия

**Given**
- `Lesson` не отменён;
- `Lesson` не имеет более приоритетного состояния;
- текущее Backend-time меньше `starts_at`.

**Then**
- статус `Lesson` = `planned`;
- Student видит человекочитаемое значение `Запланировано`.

---

## AC-US07-02 — In Progress на точной границе начала

**Given**
- `now == starts_at`;
- `Lesson` не отменён;
- не применяется более приоритетный статус.

**Then**
- статус `Lesson` = `in_progress`;
- Student видит `Идёт`.

---

## AC-US07-03 — In Progress внутри временного интервала

**Given**
- `starts_at < now < ends_at`.

**Then**
- статус `Lesson` = `in_progress`;
- Frontend отображает `Идёт`.

---

## AC-US07-04 — Completed на точной границе окончания

**Given**
- `now == ends_at`.

**Then**
- статус `Lesson` = `completed`;
- Student видит `Завершено`.

---

## AC-US07-05 — Completed после окончания

**Given**
- `now > ends_at`.

**Then**
- статус `Lesson` = `completed`;
- статус не возвращается в `planned` или `in_progress`.

---

## AC-US07-06 — Cancelled имеет высший приоритет

**Given**
- `Lesson` был отменён согласно US-06.

**Then**
- статус `Lesson` = `cancelled`;
- cancelled-state не заменяется временными статусами;
- течение времени не переводит такой `Lesson` в `in_progress` или `completed`;
- после refresh статус остаётся `cancelled`.

---

## AC-US07-07 — Rescheduled после переноса

**Given**
- `Lesson` успешно перенесён согласно US-05;
- Lesson не отменён.

**Then**
- статус отображается как `rescheduled`;
- Student видит `Перенесено`;
- используются актуальные новые дата и время;
- старые временные данные не отображаются как актуальные.

---

## AC-US07-08 — Cancelled при перенесённом и затем отменённом Lesson

**Given**
- Lesson был перенесён;
- затем отменён.

**Then**
- итоговый статус = `cancelled`;
- `cancelled` имеет приоритет над `rescheduled`.

---

## AC-US07-09 — Приоритет статусов

При одновременном выполнении нескольких условий применяется приоритет:

1. `cancelled`
2. `rescheduled`
3. `completed`
4. `in_progress`
5. `planned`

Frontend и Backend не должны показывать разные статусы для одного состояния Lesson.

---

## AC-US07-10 — Backend является источником истины

Frontend:

- получает статус либо достаточные Backend-данные для согласованного отображения;
- не должен формировать состояние, противоречащее Backend;
- не должен самостоятельно заменять валидный Backend-status другим статусом.

---

## AC-US07-11 — Timezone не меняет фактический статус

Для одного и того же фактического момента времени:

- смена timezone отображения клиента не должна менять статус;
- `starts_at` обрабатывается как timezone-aware значение;
- `ends_at` рассчитывается из `starts_at + duration`;
- сравнение выполняется в едином временном представлении.

---

## AC-US07-12 — Calendar и List согласованы

Для одного `Lesson`:

- статус в календарном представлении;
- статус в списковом представлении

должны быть одинаковыми.

Не допускается ситуация, когда один и тот же Lesson одновременно отображается, например, как `planned` в Calendar и `completed` в List.

---

## AC-US07-13 — Student representation

Student должен видеть для доступного Lesson:

- человекочитаемый статус;
- статус, соответствующий фактическому Backend-состоянию;
- визуальное различие состояний;
- корректное отображение после refresh.

---

## AC-US07-14 — Статус не различается только цветом

UI должен различать статусы не только цветовым кодированием.

Для каждого состояния должна присутствовать текстовая либо иная однозначная человекочитаемая индикация.

---

## AC-US07-15 — Обновление после создания Lesson

После создания нового Lesson согласно US-01:

- статус определяется по актуальному времени;
- если занятие в будущем — отображается `planned`;
- Frontend не требует ручного изменения статуса пользователем.

---

## AC-US07-16 — Обновление после переноса

После успешного US-05:

- данные Lesson обновляются;
- статус отображается согласованно как `rescheduled`;
- Calendar и List получают актуальное состояние;
- после refresh результат сохраняется.

---

## AC-US07-17 — Обновление после отмены

После успешного US-06:

- Lesson отображается как `cancelled`;
- Calendar и List согласованы;
- Student видит актуальное состояние;
- после refresh cancelled-state сохраняется.

---

## AC-US07-18 — Неизвестный статус

**When**
- Frontend получает неизвестное либо неподдерживаемое значение status.

**Then**
- интерфейс не падает;
- неизвестное значение не подменяется молча на `planned`;
- отображается безопасное fallback / error representation;
- ситуация может быть зафиксирована как integration defect.

---

## AC-US07-19 — Backend / API error

**When**
- актуальный статус невозможно получить из-за Backend / API / transport error.

**Then**
- Frontend не должен показывать ложный актуальный статус;
- ошибка отображается как error-state;
- отсутствие данных не трактуется автоматически как `planned`.

---

## AC-US07-20 — Persistence after refresh

После повторной загрузки страницы:

- статус соответствует Backend;
- cancelled/rescheduled не теряются;
- временные состояния пересчитываются корректно по актуальному времени;
- UI не сохраняет устаревший локальный статус.

---

## AC-US07-21 — Недопустимые переходы

Система не должна допускать:

- `cancelled → planned`;
- `cancelled → in_progress`;
- `cancelled → completed`;
- самопроизвольное снятие cancelled-state;
- ручное изменение статуса Student;
- переходы, основанные только на локальном Frontend-state без Backend-основания.

---

## AC-US07-22 — Authentication / Authorization

Неаутентифицированный пользователь не должен получать защищённые данные Lesson.

Student должен видеть только доступные ему Lesson и их статусы согласно существующим правилам доступа.

---

## AC-US07-23 — Реальный Frontend ↔ Backend E2E

Необходимо подтвердить реальные end-to-end сценарии без mock-response:

1. создание Lesson;
2. получение initial status;
3. временной переход `planned → in_progress`;
4. временной переход `in_progress → completed`;
5. перенос → `rescheduled`;
6. отмена → `cancelled`;
7. получение статуса Student;
8. одинаковое отображение в Calendar / List;
9. refresh с сохранением согласованного состояния.

---

## AC-US07-24 — Regression связанных сценариев

После внедрения US-07 должны сохранять работоспособность:

- `US-01` — создание занятия;
- `US-02` — расписание Student;
- `US-03` — календарь Teacher;
- `US-04` — проверка конфликтов;
- `US-05` — перенос;
- `US-06` — отмена.

Новая модель статусов не должна ломать существующее создание, просмотр, конфликтный flow, перенос и отмену.

---

# Обязательные Acceptance Criteria

Для Product Acceptance обязательными являются:

- `AC-US07-01` — planned;
- `AC-US07-02` — точная граница начала;
- `AC-US07-03` — in progress;
- `AC-US07-04` — точная граница окончания;
- `AC-US07-05` — completed;
- `AC-US07-06` — cancelled;
- `AC-US07-07` — rescheduled;
- `AC-US07-08` — cancelled after rescheduled;
- `AC-US07-09` — priority;
- `AC-US07-10` — Backend source of truth;
- `AC-US07-11` — timezone;
- `AC-US07-12` — Calendar / List consistency;
- `AC-US07-13` — Student representation;
- `AC-US07-14` — accessibility of status representation;
- `AC-US07-15` — initial status;
- `AC-US07-16` — update after reschedule;
- `AC-US07-17` — update after cancel;
- `AC-US07-18` — unknown status;
- `AC-US07-19` — API error;
- `AC-US07-20` — persistence;
- `AC-US07-21` — invalid transitions;
- `AC-US07-22` — authentication / authorization;
- `AC-US07-23` — Frontend ↔ Backend E2E;
- `AC-US07-24` — regression.

Если хотя бы один обязательный Acceptance Criterion имеет статус `FAIL`, итоговый статус US-07 не может быть `PASS`.
