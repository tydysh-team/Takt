# Takt

## Quick start

```shell
git clone https://github.com/tydysh-team/Takt.git
cd Takt
git switch feature/sprint1-foundation-implementation
```

Создайте local environment:

```powershell
# Windows PowerShell
Copy-Item .env.example .env
```

```shell
# Linux/macOS
cp .env.example .env
```

В `.env` замените PostgreSQL password (также внутри `DATABASE_URL`) и пять security placeholders независимыми local random values. Затем:

```shell
docker compose build
docker compose up -d
docker compose ps
docker compose exec backend python -m app.seed
```

Откройте frontend http://localhost:5173 и Swagger http://localhost:8000/api/docs. Backend автоматически применяет Alembic migrations; seed запускается вручную.

## Development credentials

После seed общий password: `TaktDemo!2026`.

- `teacher@demo.example.com`
- `student1@demo.example.com` (также `student2`, `student3`)
- `admin@demo.example.com` — для http://localhost:8000/admin

Более подробно описано в [development.md](development.md).