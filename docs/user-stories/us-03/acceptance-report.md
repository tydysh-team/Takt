# US-03 — Acceptance Report

## Проверяемая версия

- Branch: `integration/sprint1`
- Commit: `f05f4a037758f209235db1721f795c7476c3cc97`
- Environment: local Docker Compose
- Date: `2026-10-23`
- Backend automated tests: `13 passed`

После первоначальной приёмки выполнен дополнительный review реализации. Выявлены дефекты режима `Неделя` и обработки Backend/API error, затрагивающие `AC-US03-05` и `AC-US03-08`. Статус отчёта актуализирован до повторной проверки исправлений.

## Предусловия

Перед началом проверки:

- `postgres` — healthy;
- `backend` — healthy;
- `frontend` — healthy;
- выполнен development seed;
- в рамках US-01 создан будущий Lesson для `Alice Student`;
- приложение доступно через Frontend.

Проверяемый пользователь:

```text
teacher@demo.example.com
Role: TEACHER
```

## Результаты Acceptance Criteria

| Acceptance Criterion | Status | Evidence | Комментарий |
| --- | --- | --- | --- |
| `AC-US03-01` — Расписание текущего Teacher | 🟢 `PASS` | <img src="evidence/04-backend-read-tests.png" width="300"> | Automated API tests подтверждают, что Backend определяет текущего Teacher из authentication context и возвращает только доступные ему Lessons; занятия других Teachers в результат не попадают. |
| `AC-US03-02` — Данные занятия | 🟢 `PASS` | <img src="evidence/01-teacher-week-schedule.png" width="300"> | Для Lesson отображаются название `Математика`, Student `Alice Student`, дата и время начала `31 октября, 18:30`, а также длительность 60 минут (`18:30–19:30`). |
| `AC-US03-03` — Человекочитаемый Student | 🟢 `PASS` | <img src="evidence/01-teacher-week-schedule.png" width="300"> | Student отображается как `Alice Student`; технический идентификатор не используется как пользовательская подпись. |
| `AC-US03-04` — Фильтрация по периоду | 🟢 `PASS` | <img src="evidence/04-backend-read-tests.png" width="300"> | Backend корректно фильтрует Lessons по временному диапазону текущего Teacher и отклоняет некорректные параметры периода. |
| `AC-US03-05` — Режим «Неделя» | 🔴 `FAIL` | <img src="evidence/01-teacher-week-schedule.png" width="300"><br>Code Review PR #11 | Базовый сценарий отображается, однако дополнительный review выявил, что Week view не обеспечивает корректное позиционирование всех значений времени, разрешённых контрактом. Также пересекающиеся Lessons могут визуально перекрывать друг друга. Требуется исправление и retest. |
| `AC-US03-06` — Режим «Список» | 🟢 `PASS` | <img src="evidence/02-teacher-list-schedule.png" width="240"><br><img src="evidence/03-teacher-empty-day.png" width="240"> | В режиме `Список` Teacher может выбрать конкретный день. Для 31 октября отображается Lesson `Математика` с временем `18:30–19:30` и Student `Alice Student`; для дня без занятий отображается понятный empty state `На этот день занятий нет`. |
| `AC-US03-07` — Переключение недель | 🟢 `PASS` | <img src="evidence/01-teacher-week-schedule.png" width="300"> | Teacher может переключить отображаемую неделю; после перехода к периоду `26 окт. — 1 нояб. 2026` расписание обновляется и отображает Lesson соответствующего периода. |
| `AC-US03-08` — Пользовательские состояния | 🔴 `FAIL` | <img src="evidence/03-teacher-empty-day.png" width="220"><br><img src="evidence/05-schedule-api-error.png" width="220"><br>Code Review PR #11 | Backend/API error отображается явно, однако одновременно остальная часть страницы продолжает отображать данные как корректное пустое расписание (`0 занятий`, `Нет занятий`, `На этот день занятий нет`). Error и successful empty state не разделены однозначно. |
| `AC-US03-09` — Доступ к чужому расписанию | 🟢 `PASS` | <img src="evidence/04-backend-read-tests.png" width="300"> | Scope расписания определяется Backend на основании authentication context; клиент не может получить расписание другого Teacher простой подменой `teacher_id`. |
| `AC-US03-10` — Границы сценария | 🟢 `PASS` | <img src="evidence/01-teacher-week-schedule.png" width="240"><br><img src="evidence/02-teacher-list-schedule.png" width="240"> | Просмотр расписания не предоставляет действий переноса, отмены, изменения статуса или изменения Teacher/Student существующего Lesson. Доступное действие создания нового Lesson относится к US-01 и не изменяет существующие занятия. |

## Automated Tests

Для проверки чтения расписания, Teacher scope и фильтрации выполнено:

```text
python -m pytest tests/api/test_lesson_read.py -q
```

Результат:

```text
13 passed in 32.61s
```

Automated tests используются как дополнительное подтверждение Backend-критериев, связанных с доступом текущего Teacher, фильтрацией расписания и изоляцией данных других пользователей.

## Обнаруженные дефекты

### DEF-US03-01 — Week view некорректно отображает часть допустимых значений времени

Week view использует фиксированный диапазон времени и часовую сетку.

Из-за этого Lessons с временем вне отображаемого диапазона или с минутным смещением могут визуально располагаться не в соответствии со своим фактическим временем.

- Затронутый критерий: `AC-US03-05`
- Статус дефекта: 🔴 `OPEN`
- Требуется: исправление разработчиками и targeted retest

### DEF-US03-02 — пересекающиеся Lessons могут визуально перекрываться

Несколько Lessons на одинаковое или пересекающееся время могут попадать в одну область Week view и перекрывать друг друга.

- Затронутый критерий: `AC-US03-05`
- Статус дефекта: 🔴 `OPEN`
- Требуется: исправление разработчиками и targeted retest

### DEF-US03-03 — Backend/API error смешивается с successful empty state

При ошибке загрузки расписания пользователь получает `ErrorState`, однако одновременно интерфейс отображает элементы корректного пустого расписания.

В результате error state и successful empty state представлены одновременно.

- Затронутый критерий: `AC-US03-08`
- Статус дефекта: 🔴 `OPEN`
- Требуется: исправление разработчиками и targeted retest

## Итог

**Status: 🔴 `FAIL`**

Не выполнены:

- `AC-US03-05` — режим `Неделя`;
- `AC-US03-08` — пользовательские состояния.

Остальные проверенные критерии сохраняют подтверждённый результат.

После исправлений требуется targeted retest `AC-US03-05` и `AC-US03-08`, включая проверку:

- Lessons с разным временем начала;
- Lessons за пределами текущей отображаемой временной сетки;
- двух одновременно или частично пересекающихся Lessons;
- Backend/API error отдельно от successful empty state.

При успешном retest итоговый статус US-03 может быть возвращён в 🟢 `PASS` без повторной проверки незатронутых критериев.

Приёмка выполнена по критериям из [`acceptance-criteria.md`](acceptance-criteria.md).
