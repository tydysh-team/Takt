# Общая документация Takt

В этой директории находятся правила и понятия, общие для нескольких частей продукта.

## Документы

- [`product.md`](product.md) — роли, основные сущности, продуктовые правила и границы ответственности документации;
- [`api-conventions.md`](api-conventions.md) — общие правила внешнего API;
- [`acceptance-process.md`](acceptance-process.md) — общий процесс QA / Product Acceptance, статусы проверки, фиксация дефектов и правила retest.

## Принцип организации

Общая документация содержит только правила и понятия, применимые сразу к нескольким Foundation / User Story.

Требования и результаты проверки конкретной User Story находятся в:

```text
docs/user-stories/us-XX/
├── documentation.md
├── acceptance-criteria.md
├── acceptance-report.md
└── evidence/
```

Где:

- `documentation.md` — ожидаемое пользовательское поведение и границы сценария;
- `acceptance-criteria.md` — обязательные критерии готовности;
- `acceptance-report.md` — результат QA / Product Acceptance по конкретной проверяемой версии;
- `evidence/` — подтверждающие материалы проверки.

Foundation описан отдельно в:

```text
docs/foundation/
```

Документация фиксирует ожидаемое поведение, внешний контракт и обязательные ограничения, но не определяет внутреннюю техническую реализацию без необходимости.

QA / Product Acceptance проверяет соответствие реализации документации и Acceptance Criteria, но не заменяет Code Review.
