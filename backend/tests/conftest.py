import os

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://takt:test-only@localhost:5432/takt_test",
)
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("TRUSTED_HOSTS", '["testserver","localhost"]')
os.environ.setdefault("CORS_ORIGINS", '["http://localhost:5173"]')

