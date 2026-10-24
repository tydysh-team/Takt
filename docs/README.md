# Takt — документация

`/docs` содержит продуктовую, функциональную и техническую документацию Takt.

## Структура

### Продуктовая документация

```text
docs/
├── general/           
├── foundation/        
└── user-stories/
    └── us-XX/         
        ├── documentation.md
        ├── acceptance-criteria.md
        ├── acceptance-report.md
        └── evidence/
```

### Техническая документация

Технические материалы разработки хранятся отдельно:

- [`development.md`](development.md) — локальный запуск, окружение и тестирование;
- [`backend/`](backend/) — Backend-документация;
- [`frontend/`](frontend/) — Frontend-документация.

## Общая документация

[`general/`](general/) содержит правила, применимые к нескольким частям продукта:

- продуктовые понятия и общие границы;
- API conventions;
- процесс QA / Product Acceptance.

## Foundation

[`foundation/`](foundation/) содержит описание и Acceptance Criteria базовой функциональности, на которой строятся User Story.

Foundation проверяется отдельно и не требует собственного acceptance report для каждой последующей User Story.

## User Stories

Каждая User Story имеет собственную директорию:

```text
user-stories/us-XX/
├── documentation.md
├── acceptance-criteria.md
├── acceptance-report.md
└── evidence/
```

`documentation.md` фиксирует ожидаемое пользовательское поведение, бизнес-правила, внешний контракт и границы сценария.

`acceptance-criteria.md` фиксирует обязательные условия, по которым проверяется готовность User Story.

`acceptance-report.md` фиксирует результат QA / Product Acceptance по конкретной проверяемой версии, статусы Acceptance Criteria, обнаруженные дефекты и итоговый статус User Story.

`evidence/` содержит подтверждающие материалы проверки по применимости:

- screenshots;
- результаты automated tests;
- API evidence;
- другие воспроизводимые материалы.

Статусы Acceptance Criteria и итоговой приёмки оформляются единообразно:

- 🟢 `PASS` — критерий или User Story выполнены;
- 🔴 `FAIL` — обязательный критерий не выполнен;
- 🟡 `BLOCKED` — проверку невозможно завершить из-за внешнего blocker.

После исправления дефекта выполняется targeted retest затронутых Acceptance Criteria. Незатронутые подтверждённые критерии не требуют повторной полной проверки без отдельной причины.

## Источники истины

- `/docs` — согласованное продуктовое поведение, ограничения, Acceptance Criteria и результаты Product Acceptance;
- Kaiten — задачи, исполнители, статусы и планирование;
- GitHub — код, Pull Requests, Code Review и история изменений;
- согласованные UI/UX-материалы — визуальные решения.

Документация определяет **что система должна обеспечивать**, но не диктует внутреннюю техническую реализацию без необходимости.
