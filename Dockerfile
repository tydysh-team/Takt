FROM node:24-alpine AS frontend-build
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app
RUN groupadd --system takt && useradd --system --gid takt --create-home takt
COPY backend/pyproject.toml backend/alembic.ini ./
COPY backend/app ./app
COPY backend/alembic ./alembic
COPY backend/scripts ./scripts
RUN python -m pip install --no-cache-dir . \
    && chmod +x /app/scripts/start.sh
COPY --from=frontend-build /build/frontend/dist ./static
RUN chown -R takt:takt /app
USER takt
EXPOSE 10000
CMD ["/app/scripts/start.sh"]
