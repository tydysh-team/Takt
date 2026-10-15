# Проектные ресурсы

[К справочнику](../README.md)

Этот документ содержит точки входа во внешние ресурсы проекта Takt.

Здесь хранятся ссылки на канонические проектные артефакты, а не копии содержащейся в них информации. Содержание требований, задач, дизайна и технических решений должно поддерживаться в соответствующем источнике истины.

| Ресурс | Ссылка | Назначение | Статус |
| --- | --- | --- | --- |
| GitHub | [tydysh-team/Takt](https://github.com/tydysh-team/Takt) | Код, документация, ветки, Pull Request и Code Review | Активен |
| Product Backlog / Kaiten | [Доска Takt](https://softdevmgmt.kaiten.ru/space/912623/boards?focus=board&focusId=1931449) | Product Backlog, Sprint Backlog, Technical Tasks, дефекты и workflow | Активен |
| Lean Canvas | [Miro — Lean Canvas](https://miro.com/app/board/uXjVHi70vg4=/?moveToWidgets=AQBCr4iv6f2EgIAwAQEBAQEBAQEBAQEDAQECAQIBAgMBAgMBAwIBAgECAwEBv4ADu6gXI8yeA_WDC9cC6f0EAcruAiRY18EHlM4CFNuOBUYoBsq9DmRALRmR9AQQBQaAAk2A6QQJAw) | Продуктовые предпосылки, проблема, сегменты пользователей, ценностное предложение и другие элементы Lean Canvas | Активен |
| Miro | [Проектная доска](https://miro.com/welcomeonboard/ckl1N2ZOaVlEbUdzUThOM1pkd1lvZEo2eVp3UERxQWVMVGc5c1FlNnVRc3dPSVVqMnhZSDdHREEzYVlISWJQVEkrNFVPZTVLajdPMWF3dUFnU1RtT2N0RXpxcG44eXZmZ3BaRmlCOHp4VmpCdDFmdktYdW9FbmtaTmdXRktlUUJyVmtkMG5hNDA3dVlncnBvRVB2ZXBnPT0hdjE=?share_link_id=469061306483) | Проектные схемы, обсуждения и визуальные материалы | Активен |
| Планирование Sprint 1 | [Google Docs](https://docs.google.com/document/d/1rhqBtcfzWksw8VkgWcc9mnSXmnHVG8UVmcHRBAfRzZg/edit) | Формальное планирование Sprint 1 и учебный артефакт | Актуален для Sprint 1 |
| Отчёт Sprint 1 | [Google Docs](https://docs.google.com/document/d/16nXGqMiAKAs6s9bI-9EaaKa6tI59tD-J_ArRihYlegM/edit) | Формальный отчёт Sprint 1 | Актуален для Sprint 1 |
| Figma / UI/UX | [TBD](https://www.figma.com/design/SltmmWJLMOc2J1kVLuoKbC/Untitled?node-id=6-2&t=y2e7psG44r02QQe6-1) | Канонический источник утверждённого UI/UX после выполнения соответствующих задач | Ожидается в F-07 |

Правила распределения источников истины зафиксированы в [инженерном справочнике](../README.md#источники-истины).

## Использование ресурсов

- GitHub является источником истории кода, документации, Pull Request и Code Review.
- Kaiten является источником состояния Product Backlog, Sprint Backlog, технических задач, дефектов и workflow.
- Google Docs используется для формальных учебных и отчётных артефактов.
- Miro используется для Lean Canvas, схем и других согласованных визуальных проектных материалов.
- Figma становится каноническим источником UI/UX после появления и согласования дизайна.
- Runtime OpenAPI после реализации API отражает фактическую техническую схему Backend, но не заменяет согласованный API-контракт в `/docs`.

Не следует создавать независимые копии одного и того же требования, API-контракта, дизайна или другого артефакта в нескольких системах. В остальных местах должна использоваться ссылка на канонический источник.

## Ожидаемые ресурсы

| ID | Ресурс | Статус / требуемое действие |
| --- | --- | --- |
| L-04 | Figma / утверждённый UI/UX-артефакт | Будет создан или определён в рамках F-07. После согласования становится каноническим источником Design Review |

Отсутствие Figma на текущем этапе не блокирует начало F-07: создание и согласование UI/UX-основы входит в соответствующую работу.

TestRail добавляется в реестр только после фактического принятия командой и настройки проекта.
