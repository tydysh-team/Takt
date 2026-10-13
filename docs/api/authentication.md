# Аутентификация и авторизация API

[К API](conventions.md) · [Ошибки](errors.md) · [Контракты Sprint 1](contracts/sprint-01.md#foundation) · [BR-09 / BR-10](../requirements/business-rules.md) · [Модель данных](../architecture/data-model.md)

## Граница ответственности

Этот документ фиксирует общую семантику identity, authentication и authorization для Sprint 1.

Конкретные request / response DTO, HTTP status и стабильные `error.code` каждой операции фиксируются в [API-контрактах Sprint 1](contracts/sprint-01.md) и [реестре ошибок](errors.md).

Frontend не является источником полномочий пользователя. Доверенный User, его роль и соответствующий Teacher / Student context определяются Backend.

## User, роль и доменный контекст

В Sprint 1 каждый User имеет ровно одну роль:

- `teacher`;
- `student`.

Каждый User связан ровно с одним Profile, содержащим общие данные человека.

Для Profile существует ровно один ролевой профиль, соответствующий `User.role`:

- `TeacherProfile` для роли `teacher`;
- `StudentProfile` для роли `student`.

Один User не совмещает обе роли. Переключение или изменение роли после регистрации в Sprint 1 не поддерживается.

User ID, Profile ID, TeacherProfile ID и StudentProfile ID являются разными идентификаторами и не взаимозаменяются. В API `teacher_id` и `student_id` обозначают идентификаторы соответствующих ролевых профилей.

Backend после успешной authentication строит доверенный текущий context:

```text
credential → User → Profile → role → TeacherProfile / StudentProfile
```

Frontend не вычисляет TeacherProfile ID / StudentProfile ID из User ID и не передаёт произвольный идентификатор для определения пользователя, от имени которого выполняется защищённая операция.

Если credential валиден и User найден, но invariant BR-09 нарушен — например, отсутствует обязательный Profile, отсутствует ролевой профиль, ролевой профиль не соответствует роли либо одновременно существуют TeacherProfile и StudentProfile — это **server-side inconsistency**, а не ошибка полномочий пользователя. Публично такой случай обрабатывается как `500 internal_error`; он не превращается в `403 forbidden`.

## Регистрация

Sprint 1 использует:

```text
POST /api/v1/auth/register
```

Authentication для регистрации не требуется.

Обязательные регистрационные данные:

- `email`;
- `password`;
- `role`;
- `first_name`;
- `last_name`.

`middle_name` является опциональным.

### Email

`email` является идентификатором User для последующего входа.

Перед проверкой уникальности и сохранением Backend приводит email к каноническому виду:

1. удаляет пробельные символы в начале и конце;
2. приводит значение к нижнему регистру.

После нормализации email:

- должен иметь корректный формат адреса электронной почты;
- должен быть уникальным;
- одинаковый адрес в другом регистре не создаёт отдельный User.

Подтверждение владения email в Sprint 1 не требуется.

При login введённый email приводится к той же канонической форме перед поиском User.

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

- User;
- Profile;
- ровно один соответствующий TeacherProfile или StudentProfile.

Частичное состояние `User без Profile`, Profile без требуемого ролевого профиля, ролевой профиль несоответствующей роли либо одновременные TeacherProfile и StudentProfile для одного Profile не является допустимым результатом.

### Имя пользователя

Общие данные имени сохраняются в Profile структурированно:

- `first_name` — required, non-null;
- `last_name` — required, non-null;
- `middle_name` — optional, nullable.

Перед сохранением `first_name` и `last_name` trim-ятся и после trim должны оставаться непустыми.

Если `middle_name` передан строкой, он trim-ится; пустое после trim значение нормализуется в `null`.

Отдельное persisted-поле `display_name` в Sprint 1 не используется. Человекочитаемое имя в UI формируется из структурированных полей имени.

Регистрация не означает автоматический вход. В Sprint 1 access token получается через отдельную операцию login согласно API-02.

## Вход

Sprint 1 использует:

```text
POST /api/v1/auth/login
```

Authentication не требуется.

Вход выполняется по:

- `email`;
- `password`.

Request использует JSON согласно общим [API conventions](conventions.md).

Email нормализуется тем же способом, что и при регистрации. Password проверяется без автоматического trim / lowercase / иной модификации.

При успешной проверке credentials Backend выдаёт access token согласно `TokenDTO`, определённому API-контрактом.

При неверном email либо неверном password возвращается одинаковая ошибка `401 invalid_credentials`. Ответ не должен раскрывать, существует ли User с указанным email.

## Access token

Защищённый запрос передаёт:

```text
Authorization: Bearer <access_token>
```

Frontend рассматривает access token как непрозрачную строку.

Frontend не должен:

- использовать claims token как единственный источник role / authorization;
- вычислять из token TeacherProfile ID / StudentProfile ID для доверенных операций;
- зависеть от внутреннего формата token.

Backend валидирует credential и только после этого формирует доверенный User / role / domain context.

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

```text
GET /api/v1/me
```

Она возвращает Frontend доверенное представление текущего User и его единственного domain context, достаточное для role-based routing и отображения текущего пользователя.

Response должен отражать:

- User ID;
- роль `teacher` или `student`;
- reference соответствующего TeacherProfile / StudentProfile с полями имени из общего Profile.

Точный состав `UserContextDTO` фиксируется в [API-контракте](contracts/sprint-01.md#api-03--текущий-контекст).

Frontend не передаёт User ID, TeacherProfile ID или StudentProfile ID для определения текущего пользователя в `/me`.

Получение текущего domain context внутри Backend не зависит от того, выполнял ли Frontend отдельный запрос `/me`: Backend строит context непосредственно из authentication credential для каждого защищённого запроса.

Если для валидного User невозможно построить обязательный Profile и единственный соответствующий ролевой domain profile из-за нарушения BR-09, Backend возвращает `500 internal_error`; этот случай рассматривается как defect / data invariant failure и не как `403`.

## Авторизация защищённых операций

Authentication отвечает на вопрос «кто выполняет запрос».

Authorization дополнительно проверяет:

- допустима ли роль для операции;
- принадлежит ли ресурс текущему пользователю;
- доступен ли целевой ресурс согласно Business Rules.

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
| User аутентифицирован, но роль / операция запрещена | `403 forbidden` |
| Валидный User нарушает обязательный Profile / role-profile invariant BR-09 | `500 internal_error` |

Для защищённого `401` Backend использует `WWW-Authenticate: Bearer`.

Если существование чужого ресурса не должно раскрываться, API может возвращать согласованный `404`, например `student_not_available` для отсутствующего либо недоступного Student при создании Lesson.

Повторная регистрация уже используемого нормализованного email возвращает согласованный `409 email_already_registered` согласно [реестру ошибок](errors.md) и API-01.

## Поведение Frontend

После `401 authentication_required` на защищённом запросе Frontend прекращает использовать недействительную локальную session и переводит пользователя к повторной authentication.

`401 invalid_credentials` на форме login является ошибкой введённых credentials и не рассматривается как истечение уже существующей session.

`403 forbidden` не должен автоматически инициировать повторный login.

Frontend отображает role-dependent сценарии по доверенному context, полученному от Backend, но окончательная авторизация каждого запроса остаётся на Backend.

Passwords, password hashes и реальные Bearer tokens не включаются в application logs, screenshots, сохраняемое / публикуемое QA evidence или другие диагностические артефакты, которые могут покинуть безопасный runtime context.

При API-02 access token **законно присутствует в success response**, потому что `TokenDTO` является контрактом login. В QA / bug evidence это значение редактируется / скрывается.

## Проверки Sprint 1

Минимально проверить:

- регистрация с ролью `teacher` создаёт User, Profile и ровно один TeacherProfile;
- регистрация с ролью `student` создаёт User, Profile и ровно один StudentProfile;
- другая роль отклоняется;
- отсутствие любого обязательного регистрационного поля отклоняется;
- email сохраняется после trim + lowercase;
- email с отличающимся регистром не создаёт второй User;
- повторная регистрация уже используемого нормализованного email отклоняется как `409 email_already_registered`;
- email с некорректным форматом отклоняется;
- password длиной `7` и `129` символов отклоняется;
- password длиной `8` и `128` символов допускается;
- password не изменяется системой перед проверкой credentials;
- `first_name` и `last_name` trim-ятся и не могут стать пустыми;
- `middle_name` допускает отсутствие / `null`, а пустая после trim строка нормализуется в `null`;
- открытый password и `password_hash` не возвращаются API;
- login использует email и одинаково отвечает на неизвестный email / неверный password;
- успешный API-02 возвращает `TokenDTO` с `access_token` и `token_type="bearer"`;
- реальные access tokens не попадают в logs / screenshots / сохраняемое QA evidence;
- защищённый endpoint без token возвращает authentication error;
- Student не получает Teacher-only операции и наоборот;
- подмена User / TeacherProfile / StudentProfile ID со стороны клиента не изменяет текущую identity;
- `/me` возвращает context только текущего User;
- нарушение invariant User → Profile → matching TeacherProfile / StudentProfile рассматривается как `500 internal_error`, а не `403`.

## Границы Sprint 1

В Sprint 1 не входят:

- подтверждение email;
- восстановление / reset password;
- изменение password;
- изменение или переключение роли;
- multi-role User;
- refresh token;
- серверный logout / token revocation;
- OAuth / внешний identity provider;
- расширенное управление User / Profile / role profiles.

Добавление этих возможностей требует отдельного требования, API-контракта и применимого изменения модели / архитектуры.
