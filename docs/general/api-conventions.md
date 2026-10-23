# Takt — API conventions

Документ фиксирует общие правила внешнего API Takt.

Требования конкретных операций описываются в документации соответствующих User Story.

## 1. Base path

Прикладные API используют prefix:

```text
/api/v1
```

## 2. Формат данных

Request и response передаются в JSON.

Для JSON request используется:

```text
Content-Type: application/json
```

Имена JSON-полей и query parameters используют `snake_case`.

Успешный response возвращает согласованный DTO или массив DTO без обязательной общей `data`-обёртки.

Пустая успешная коллекция возвращается как:

```json
[]
```

## 3. Authentication

Защищённые операции используют текущий authentication context.

Для access credential поддерживается:

```text
Authorization: Bearer <access_token>
```

Backend самостоятельно определяет текущего пользователя и его права.

Frontend не должен выполнять действие от имени другого пользователя простой подменой `user_id`, `teacher_id`, `student_id` или другого идентификатора.

Конкретная внутренняя реализация token/session mechanism не является частью продуктовой документации.

## 4. Error response

Ожидаемые API errors используют единый формат:

```json
{
  "error": {
    "code": "error_code",
    "message": "Human-readable message",
    "details": []
  }
}
```

Где:

- `error.code` — стабильный machine-readable код ошибки;
- `error.message` — безопасное человекочитаемое сообщение;
- `error.details` — дополнительные сведения об ошибке при наличии.

Frontend должен принимать программные решения по HTTP status и `error.code`, а не по точному тексту `error.message`.

Публичный response не должен раскрывать чувствительные внутренние данные, например:

- stack trace;
- SQL / database errors;
- password;
- tokens;
- secrets;
- внутренние exception details.

## 5. HTTP semantics

Общие значения HTTP status:

| HTTP | Значение |
| ---: | --- |
| `200` | успешное получение или выполнение операции |
| `201` | успешное создание ресурса |
| `204` | успешная операция без response body |
| `400` | запрос корректен по формату, но нарушает правило операции |
| `401` | authentication отсутствует или недействительна |
| `403` | пользователь определён, но операция ему запрещена |
| `404` | ресурс недоступен или не найден |
| `409` | конфликт текущего состояния |
| `422` | request не соответствует ожидаемому формату или validation rules |
| `500` | неожиданная server-side ошибка |

Конкретный status и `error.code` определяются соответствующей операцией.

## 6. Date / time

Дата и время, передаваемые между Frontend и Backend как конкретный момент времени, должны быть timezone-aware.

Backend работает с однозначным абсолютным моментом времени.

Frontend отвечает за преобразование пользовательского локального ввода в корректное transport value и за отображение времени в пользовательском часовом поясе.

## 7. Граница контракта

Внешним контрактом считаются наблюдаемые элементы взаимодействия, включая:

- HTTP method;
- path;
- authentication requirements;
- обязательные request fields;
- response DTO;
- HTTP status;
- `error.code`.

Внутренняя архитектура, модели БД, services, repositories, библиотеки и другие implementation details внешним API-контрактом не определяются.
