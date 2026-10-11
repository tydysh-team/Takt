# Аутентификация и авторизация API

[К API](conventions.md) · [Ошибки](errors.md) · [Контракты Sprint 1](contracts/sprint-01.md#foundation) · [BR-09 / BR-10](../requirements/business-rules.md) · [Модель данных](../architecture/data-model.md)

## Граница ответственности

Этот документ фиксирует общую семантику identity, authentication и authorization для Sprint 1.

Конкретные request / response DTO, HTTP status и стабильные error codes каждой операции фиксируются в [API-контрактах Sprint 1](contracts/sprint-01.md) и [реестре ошибок](errors.md).

Frontend не является источником полномочий пользователя. Доверенный Account, его роль и соответствующий Teacher / Student context определяются Backend.

## Account, роль и доменный контекст

В Sprint 1 каждый Account имеет ровно одну роль:

- `teacher`;
- `student`.

Account роли `teacher` связан ровно с одним соответствующим Teacher profile.

Account роли `student` связан ровно с одним соответствующим Student profile.

Один Account не совмещает обе роли. Переключение или изменение роли после регистрации в Sprint 1 не поддерживается.

Account ID, Teacher ID и Student ID являются разными идентификаторами и не взаимозаменяются.

Backend после успешной authentication строит доверенный текущий context:

`credential → Account → role → соответствующий Teacher / Student profile`.

Frontend не вычисляет Teacher ID / Student ID из Account ID и не передаёт произвольный идентификатор для определения пользователя, от имени которого выполняется защищённая операция.

## Регистрация

Sprint 1 использует:

`POST /api/v1/auth/register`

Authentication для регистрации не требуется.

Обязательные регистрационные данные:

- `email`;
- `password`;
- `role`;
- `display_name`.

### Email

`email` является идентификатором Account для последующего входа.

Перед проверкой уникальности и сохранением Backend приводит email к каноническому виду:

1. удаляет пробельные символы в начале и конце;
2. приводит значение к нижнему регистру.

После нормализации email:

- должен иметь корректный формат адреса электронной почты;
- должен быть уникальным;
- одинаковый адрес в другом регистре не создаёт отдельный Account.

Подтверждение владения email в Sprint 1 не требуется.

При login введённый email приводится к той же канонической форме перед поиском Account.

### Password

`password` обязателен.

Для Sprint 1 допустима длина от `8` до `128` символов включительно.

Password:

- не обрезается автоматически;
- не приводится к другому регистру;
- не нормализуется;
- не требует специальных классов символов сверх ограничения длины.

Backend не хранит открытый password. В persistence сохраняется только `password_hash`.

Конкретный hashing-механизм и его параметры определяются в I-01 до завершения реализации authentication.

### Role и profile

`role` принимает только:

- `teacher`;
- `student`.

Регистрация атомарно создаёт:

- Account;
- ровно один соответствующий Teacher или Student profile.

Частичное состояние `Account без требуемого profile`, profile несоответствующей роли либо одновременные Teacher и Student для одного Account не является допустимым результатом.

### Display name

`display_name` обязателен для создаваемого Teacher / Student.

Перед сохранением удаляются пробельные символы в начале и конце. После этого значение должно оставаться непустым.

`display_name` является минимальной человекочитаемой подписью профиля и не заменяется UUID в пользовательском интерфейсе.

Регистрация не означает автоматический вход, если API-контракт явно не определяет иное. В Sprint 1 token получается через отдельную операцию login.

## Вход

Sprint 1 использует:

`POST /api/v1/auth/login`

Authentication не требуется.

Вход выполняется по:

- `email`;
- `password`.

Request использует JSON согласно общим [API conventions](conventions.md).

Email нормализуется тем же способом, что и при регистрации. Password проверяется без автоматического trim / lowercase / иной модификации.

При успешной проверке credentials Backend выдаёт access token согласно `TokenDTO`, определённому API-контрактом.

При неверном email либо неверном password возвращается одинаковая ошибка `401 invalid_credentials`. Ответ не должен раскрывать, существует ли Account с указанным email.

## Access token

Защищённый запрос передаёт:

`Authorization: Bearer <access_token>`

Frontend рассматривает access token как непрозрачную строку.

Frontend не должен:

- использовать claims токена как единственный источник role / authorization;
- вычислять из токена Teacher ID / Student ID для доверенных операций;
- зависеть от внутреннего формата token.

Backend валидирует credential и только после этого формирует доверенный Account / role / domain context.

Конкретные:

- формат token;
- способ подписи или иной механизм проверки;
- срок жизни;
- Backend token implementation

определяются в I-01.

Способ хранения access token во Frontend определяется в I-02 до реализации auth UI.

Само использование Bearer transport не означает, что проект уже выбрал JWT, OAuth provider, refresh token или конкретный browser storage.

## Текущий пользовательский context

Sprint 1 предоставляет защищённую операцию:

`GET /api/v1/me`

Она возвращает Frontend доверенное представление текущего Account и его единственного доменного context, достаточное для role-based routing и отображения текущего пользователя.

Response должен отражать:

- Account ID;
- роль `teacher` или `student`;
- reference соответствующего Teacher / Student profile.

Точный состав `ContextDTO` фиксируется в [API-контракте](contracts/sprint-01.md#api-03--текущий-контекст).

Frontend не передаёт Account ID, Teacher ID или Student ID для определения текущего пользователя в `/me`.

Получение текущего domain context внутри Backend не зависит от того, выполнял ли Frontend отдельный запрос `/me`: Backend строит context непосредственно из authentication credential для каждого защищённого запроса.

## Авторизация защищённых операций

Authentication отвечает на вопрос «кто выполняет запрос».

Authorization дополнительно проверяет:

- допустима ли роль для операции;
- принадлежит ли ресурс текущему пользователю;
- доступен ли целевой ресурс согласно бизнес-правилам.

Примеры Sprint 1:

- Lesson создаёт только текущий Teacher;
- `teacher_id` не принимается от клиента как автор создаваемого Lesson;
- `student_id` в `LessonCreateDTO` обозначает целевого Student, а не identity текущего пользователя;
- Backend повторно проверяет Teacher–Student relation при создании Lesson;
- upcoming Lesson выбираются только для текущего Student;
- календарный диапазон возвращает только Lesson текущего Teacher.

Router guard, скрытая кнопка или role state во Frontend являются UX-мерами и не заменяют Backend authorization.

## Ошибки authentication / authorization

Общая форма ответа задаётся [error model](errors.md).

Базовая семантика:

| Ситуация | HTTP / code |
| --- | --- |
| Нет Bearer credential, token невалиден или истёк | `401 authentication_required` |
| Неверные credentials при login | `401 invalid_credentials` |
| Account аутентифицирован, но роль / операция запрещена | `403 forbidden` |

Для защищённого `401` Backend использует `WWW-Authenticate: Bearer`.

Если существование чужого ресурса не должно раскрываться, API может возвращать согласованный `404`, например `student_not_available` для отсутствующего либо недоступного Student при создании Lesson.

Регистрационный конфликт по уже используемому нормализованному email должен иметь один согласованный `409` error code, который фиксируется в [errors.md](errors.md) и API-01. До синхронизации этих двух документов нельзя вводить другой локальный код только в реализации.

## Поведение Frontend

После `401 authentication_required` на защищённом запросе Frontend прекращает использовать недействительную локальную session и переводит пользователя к повторной authentication.

`401 invalid_credentials` на форме login является ошибкой введённых credentials и не рассматривается как истечение уже существующей session.

`403 forbidden` не должен автоматически инициировать повторный login.

Frontend отображает role-dependent сценарии по доверенному context, полученному от Backend, но окончательная авторизация каждого запроса остаётся на Backend.

Пароли и Bearer tokens не включаются в application logs, browser debug artifacts, screenshots или иные QA evidence.

## Проверки Sprint 1

Минимально проверить:

- регистрация с ролью `teacher` создаёт Account и ровно один Teacher profile;
- регистрация с ролью `student` создаёт Account и ровно один Student profile;
- другая роль отклоняется;
- отсутствие любого обязательного регистрационного поля отклоняется;
- email сохраняется после trim + lowercase;
- email с отличающимся регистром не создаёт второй Account;
- повторная регистрация уже используемого нормализованного email отклоняется;
- email с некорректным форматом отклоняется;
- password длиной `7` и `129` символов отклоняется;
- password длиной `8` и `128` символов допускается;
- password не изменяется системой перед проверкой credentials;
- `display_name` trim-ится и не может стать пустым;
- открытый password не сохраняется и не возвращается;
- login использует email и одинаково отвечает на неизвестный email / неверный password;
- защищённый endpoint без token возвращает authentication error;
- Student не получает Teacher-only операции и наоборот;
- подмена Account / Teacher / Student ID со стороны клиента не изменяет текущую identity;
- `/me` возвращает context только текущего Account;
- password / token отсутствуют в API response и QA evidence.

## Границы Sprint 1

В Sprint 1 не входят:

- подтверждение email;
- восстановление / reset password;
- изменение password;
- изменение или переключение роли;
- multi-role Account;
- refresh token;
- серверный logout / token revocation;
- OAuth / внешний identity provider;
- расширенное управление Account / profile.

Добавление этих возможностей требует отдельного требования, API-контракта и применимого изменения модели / архитектуры.
