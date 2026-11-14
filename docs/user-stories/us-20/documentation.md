# US-20 — Сводный показатель прогресса

## User Story

**Я как преподаватель хочу видеть сводную статистику ученика по посещаемости, выполнению домашних заданий и результатам их проверки, чтобы быстро оценивать динамику его обучения.**

---

## 1. Цель

Собрать для `Teacher` в одном представлении ключевые факты о прогрессе конкретного Student.

Сводка не должна превращаться в непрозрачный рейтинг.

## 2. Состав summary

Минимум три объяснимых блока:

1. посещаемость;
2. выполнение Homework;
3. результаты проверки Homework.

Каждый блок строится на уже определённых источниках и имеет понятную подпись периода.

## 3. Посещаемость

Использует данные US-18.

Допустимые показатели:

- количество состоявшихся занятий;
- посещено;
- пропущено;
- доля посещения при наличии корректного знаменателя.

## 4. Homework

Использует US-19.

Допустимые показатели:

- назначено;
- отправлено;
- reviewed;
- late;
- revision required.

## 5. Результаты проверки

Используются фактические Review Result.

Если применяются числовые оценки, summary агрегирует только реально оценённые работы.

Отсутствующая оценка не превращается автоматически в `0`.

## 6. Динамика

Если UI показывает изменение относительно предыдущего периода:

- сравниваются сопоставимые периоды;
- формула одинакова для Backend и UI;
- отсутствие данных предыдущего периода отображается как отсутствие базы сравнения, а не как искусственные `+100%` / `-100%`.

## 7. Основной сценарий

1. Teacher открывает Student.
2. Переходит к progress summary.
3. Выбирает / видит текущий период.
4. Backend проверяет Teacher ↔ Student.
5. Формирует блоки из Lesson/attendance/Homework/reviews.
6. UI показывает сводку.
7. Teacher может перейти к исходной истории занятий или Homework.

## 8. Внешний контракт

```text
GET /api/v1/teachers/me/students/{student_id}/progress
```

Query:

```text
?date_from=...&date_to=...
```

Response группирует метрики по объяснимым блокам:

```json
{
  "student_id": "00000000-0000-0000-0000-000000000001",
  "date_from": "2030-01-01T00:00:00Z",
  "date_to": "2030-02-01T00:00:00Z",
  "attendance": {
    "total_lessons": 12,
    "completed_lessons": 10,
    "attended_lessons": 7,
    "missed_lessons": 2,
    "unmarked_lessons": 1,
    "cancelled_lessons": 1,
    "attendance_rate": 77.78
  },
  "homework": {
    "assigned": 10,
    "submitted": 8,
    "reviewed": 7,
    "late": 2,
    "revision_required": 3,
    "completion_rate": 70.0
  },
  "reviews": {
    "graded_homework": 6,
    "average_grade": 82.5
  }
}
```

Обе границы — timezone-aware ISO 8601 datetime; период полуоткрытый
`date_from <= timestamp < date_to`. Attendance использует `Lesson.starts_at`
и расчёт US-18, Homework — `Homework.created_at` и расчёт US-19. Для Reviews
используется та же когорта Homework: по последней Submission Attempt берётся
сохранённый Review, только если его решение `accepted` и `grade` не равен `null`.
`graded_homework` — число таких работ; `average_grade` — их средняя оценка,
округлённая до двух знаков, или `null`, когда оценённых работ нет.

`comparison` сейчас не возвращается: UI не требует его для Backend-контракта,
а единая формула сравнения периодов не определена. Скрытый интегральный score
не используется.

## 9. Частично отсутствующие данные

Summary должен работать, если:

- есть Lesson, но нет Homework;
- есть Homework, но нет review results;
- есть attendance не для всех Lesson;
- в предыдущем периоде нет данных.

Один пустой блок не ломает остальные.

## 10. Error states

Ошибка обязательного агрегирующего запроса не должна превращаться в правдоподобную, но неверную статистику.

Если блоки грузятся независимо, UI явно показывает недоступность конкретного блока.

## 11. Зависимости

- US-18;
- US-19;
- review data US-14;
- [`../../general/progress-statistics.md`](../../general/progress-statistics.md).

## 12. Out of Scope

- AI-рейтинг;
- педагогические рекомендации;
- сравнение Students;
- публичный leaderboard;
- финансовый progress.

## 13. Пользовательский результат

Teacher за один экран понимает основные факты обучения Student и может проверить их через исходные данные.

---

## 14. Product Acceptance coverage

Поведение этой User Story принимается только после проверки всех критериев из [`acceptance-criteria.md`](./acceptance-criteria.md). Для US-20 определены **10 независимых AC**, покрывающих happy path, authorization, validation, lifecycle, negative/error states, согласованность Backend/Frontend и применимые edge/concurrency cases.

Фактические результаты фиксируются в [`acceptance-report.md`](./acceptance-report.md); до передачи реализации на QA отчёт имеет статус **🟡 BLOCKED**.

## 15. Security & authorization

- Backend является финальной точкой контроля доступа; скрытие кнопки/маршрута на Frontend не считается достаточной защитой.
- Идентификаторы из request нельзя использовать для обхода ownership.
- При отказе доступа response не должен раскрывать данные чужого Teacher/Student/Homework/Submission.

## 16. Reliability & concurrency

- Mutating action считается завершённым только после подтверждения Backend.
- Double-click, retry и конкурентная смена lifecycle не должны приводить к двойному применению одного логического действия.
- При конфликте состояния пользователь получает явный conflict/error state и должен перезагрузить актуальные данные.

## 17. Observability & performance

Для ошибок, влияющих на Product Acceptance, должны быть доступны диагностические данные Backend/Frontend (request correlation/лог ошибки или эквивалент в принятом стеке) без вывода чувствительных данных пользователю.

Performance проверяется как Sprint-ориентир, а не production SLA: интерактивные запросы — ориентир p95 ≤ 500 мс, агрегирующие статистические запросы — p95 ≤ 1000 мс на типовом тестовом объёме.

## 18. Contract alignment before merge

Перед merge документации необходимо сверить буквальные endpoint paths, DTO-поля и enum/status с фактической реализацией. При расхождении нельзя «подгонять» acceptance result: сначала синхронизируется контракт документации и кода, затем выполняется Product Acceptance.

Ссылки на общие правила:

- [`../../foundation/api-conventions.md`](../../foundation/api-conventions.md)
- [`../../foundation/domain-rules.md`](../../foundation/domain-rules.md)
