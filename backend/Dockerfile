FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

RUN groupadd --system takt && useradd --system --gid takt --create-home takt

COPY pyproject.toml ./
COPY alembic.ini ./
COPY app ./app
COPY alembic ./alembic
COPY scripts ./scripts

RUN python -m pip install --no-cache-dir . \
    && chmod +x /app/scripts/start.sh \
    && chown -R takt:takt /app

USER takt

EXPOSE 8000

CMD ["/app/scripts/start.sh"]

