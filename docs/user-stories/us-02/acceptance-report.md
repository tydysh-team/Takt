# US-02 — Acceptance Report

## Проверяемая версия

- Branch: `integration/sprint1`
- Commit: `38d1e3de59556c3b0f9fc861171e8bc18dbc3c0e`
- Environment: local Docker Compose
- Date: `2026-10-23`
- Backend automated tests: `13 passed` + `1 passed`

После первоначальной приёмки выполнен дополнительный review реализации. Выявлены дефекты режима `Неделя` и обработки Backend/API error, затрагивающие `AC-US02-05` и `AC-US02-08`. Статус отчёта актуализирован до повторной проверки исправлений.

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
student1@demo.example.com
Role: STUDENT
```

## Результаты Acceptance Criteria

| Acceptance Criterion | Status | Evidence | Комментарий |
| --- | --- | --- | --- |
| `AC-US02-01` — Расписание текущего Student | 🟢 `PASS` | <img src="evidence/04-backend-read-tests.png" width="300"> | Automated API tests подтверждают, что Backend определяет текущего Student из authentication context и возвращает только доступные ему Lessons; занятия других Students в результат не попадают. |
| `AC-US02-02` — Предстоящие занятия | 🟢 `PASS` | <img src="evidence/01-student-week-schedule.png" width="300"> | Student видит своё предстоящее занятие `Математика` на 31 октября 2026 года в 18:30 продолжительностью 60 минут. |
| `AC-US02-03` — Человекочитаемый Teacher | 🟢 `PASS` | <img src="evidence/01-student-week-schedule.png" width="300"> | Teacher отображается как `Demo Teacher`; технический идентификатор не используется как пользовательская подпись преподавателя. |
| `AC-US02-04` — Фильтрация по периоду | 🟢 `PASS` | <img src="evidence/04-backend-read-tests.png" width="300"> | Backend корректно фильтрует Lessons по заданному временному диапазону и отклоняет некорректные параметры периода. |
| `AC-US02-05` — Режим «Неделя» | 🔴 `FAIL` | <img src="evidence/01-student-week-schedule.png" width="300"><br>Code Review PR #11 | Базовый сценарий отображается, однако дополнительный review выявил, что Week view использует ограниченную временную сетку и не обеспечивает корректное позиционирование всех значений времени, разрешённых текущим контрактом. Также пересекающиеся Lessons могут визуально перекрывать друг друга. Требуется исправление и retest. |
| `AC-US02-06` — Режим «Список» | 🟢 `PASS` | <img src="evidence/02-student-list-schedule.png" width="240"><br><img src="evidence/03-student-empty-day.png" width="240"> | В режиме `Список` Student может выбрать конкретный день. Для 31 октября отображается Lesson `Математика` с временем `18:30–19:30` и Teacher `Demo Teacher`; для дня без занятий отображается понятный empty state `На этот день занятий нет`. |
| `AC-US02-07` — Переключение недель | 🟢 `PASS` | <img src="evidence/01-student-week-schedule.png" width="300"> | Пользователь может переключить отображаемую неделю; после перехода к периоду `26 окт. — 1 нояб. 2026` расписание обновляется и показывает Lesson соответствующего периода. |
| `AC-US02-08` — Пользовательские состояния | 🔴 `FAIL` | <img src="evidence/03-student-empty-day.png" width="220"><br><img src="evidence/05-schedule-api-error.png" width="220"><br>Code Review PR #11 | Backend/API error отображается явно, однако одновременно остальная часть страницы продолжает отображать данные как корректное пустое расписание (`0 занятий`, `Нет занятий`, `На этот день занятий нет`). Error и successful empty state не разделены однозначно. |
| `AC-US02-09` — Ограничение возможностей Student | 🟢 `PASS` | <img src="evidence/01-student-week-schedule.png" width="240"><br><img src="evidence/06-student-create-restriction.png" width="240"> | В интерфейсе Student отсутствует возможность создания Lesson. Automated API test подтверждает, что Student не может выполнить Teacher-сценарий создания. Изменение и отмена Lesson в рамках сценария просмотра недоступны; Backend ограничивает данные authentication context текущего пользователя. |

## Automated Tests

Для проверки чтения расписания, пользовательского scope и фильтрации выполнено:

```text
python -m pytest tests/api/test_lesson_read.py -q
```

Результат:

```text
13 passed in 31.04s
```

Дополнительно проверено ограничение создания Lesson для Student:

```text
python -m pytest tests/api/test_lessons.py::test_create_lesson_requires_teacher -q
```

Результат:

```text
1 passed in 2.34s
```

Automated tests используются как дополнительное подтверждение Backend-критериев, связанных с доступом текущего пользователя, фильтрацией расписания и ограничением возможностей Student.

## Обнаруженные дефекты

### DEF-US02-01 — Week view некорректно отображает часть допустимых значений времени

Week view использует фиксированный диапазон времени и размещает Lesson по часовой сетке.

В результате Lessons с временем вне отображаемого диапазона или с минутным смещением могут визуально располагаться не в соответствии со своим фактическим временем.

- Затронутый критерий: `AC-US02-05`
- Статус дефекта: 🔴 `OPEN`
- Требуется: исправление разработчиками и targeted retest

### DEF-US02-02 — пересекающиеся Lessons могут визуально перекрываться

Несколько Lessons на одинаковое или пересекающееся время могут попадать в одну область Week view и перекрывать друг друга.

Это особенно важно, поскольку US-01 допускает создание нескольких Lessons на одинаковое или пересекающееся время.

- Затронутый критерий: `AC-US02-05`
- Статус дефекта: 🔴 `OPEN`
- Требуется: исправление разработчиками и targeted retest

### DEF-US02-03 — Backend/API error смешивается с successful empty state

При ошибке загрузки расписания пользователь получает `ErrorState`, однако одновременно интерфейс отображает элементы корректного пустого расписания.

В результате error state и successful empty state представлены одновременно.

- Затронутый критерий: `AC-US02-08`
- Статус дефекта: 🔴 `OPEN`
- Требуется: исправление разработчиками и targeted retest

## Итог

**Status: 🔴 `FAIL`**

Не выполнены:

- `AC-US02-05` — режим `Неделя`;
- `AC-US02-08` — пользовательские состояния.

Остальные проверенные критерии сохраняют подтверждённый результат.

После исправлений требуется targeted retest `AC-US02-05` и `AC-US02-08`, включая проверку:

- Lessons с разным временем начала;
- Lessons за пределами текущей отображаемой временной сетки;
- двух одновременно или частично пересекающихся Lessons;
- Backend/API error отдельно от successful empty state.

При успешном retest итоговый статус US-02 может быть возвращён в 🟢 `PASS` без повторной проверки незатронутых критериев.

Приёмка выполнена по критериям из [`acceptance-criteria.md`](acceptance-criteria.md).
