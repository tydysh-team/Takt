# Takt — документация

`/docs` содержит продуктовую, функциональную и техническую документацию Takt.

## Структура

### Продуктовая документация

```text
docs/
├── general/
│   ├── README.md
│   ├── product.md
│   ├── api-conventions.md
│   └── acceptance-process.md
│
├── foundation/
│   ├── documentation.md
│   └── acceptance-criteria.md
│
└── user-stories/
    ├── us-01/
    │   ├── documentation.md
    │   └── acceptance-criteria.md
    ├── us-02/
    │   ├── documentation.md
    │   └── acceptance-criteria.md
    └── us-03/
        ├── documentation.md
        └── acceptance-criteria.md
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

## User Stories

Каждая User Story имеет собственную директорию:

```text
user-stories/us-XX/
├── documentation.md
└── acceptance-criteria.md
```

`documentation.md` фиксирует ожидаемое пользовательское поведение, бизнес-правила, внешний контракт и границы сценария.

`acceptance-criteria.md` фиксирует условия, по которым проверяется готовность User Story.

## Источники истины

- `/docs` — согласованное продуктовое поведение, ограничения и Acceptance Criteria;
- Kaiten — задачи, исполнители, статусы и планирование;
- GitHub — код, Pull Requests и история изменений;
- согласованные UI/UX-материалы — визуальные решения.

Документация определяет **что система должна обеспечивать**, но не диктует внутреннюю техническую реализацию без необходимости.
