# TaleMotion Backend

This is the production-shaped backend foundation for TaleMotion. FastAPI and a
separate Celery worker share synchronous SQLAlchemy repositories and services.
PostgreSQL is the persistence layer; Redis is the Celery broker and result
backend.

## Configure native services

Verify the existing Linux services:

```bash
systemctl status postgresql
systemctl status redis-server
pg_isready
redis-cli ping
```

Copy `.env.example` to `.env` and set local credentials. Both
`DATABASE_URL` and a distinct `TEST_DATABASE_URL` are required. Tests refuse a
test URL that matches the development URL or does not visibly name a test
database.

If needed, create the role and databases manually:

```bash
sudo -u postgres psql
```

```sql
CREATE USER talemotion WITH PASSWORD 'development-password';
CREATE DATABASE talemotion_dev OWNER talemotion;
CREATE DATABASE talemotion_test OWNER talemotion;
```

Do not run these statements over existing resources.

## Run and migrate

```bash
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

Run the worker separately:

```bash
uv run celery -A app.core.celery_app worker \
  -Q storyboard,media,rendering,system --loglevel=info
```

Migration reversibility:

```bash
uv run alembic downgrade base
uv run alembic upgrade head
```

## Verify

```bash
uv run ruff check .
uv run pytest
```

The suite uses PostgreSQL JSONB and constraints through `talemotion_test`;
SQLite is not supported. Set `RUN_CELERY_INTEGRATION=1` only while a worker is
running to exercise the Redis → worker → PostgreSQL diagnostic path.

Genblaze, Backblaze B2, narration, media generation, and FFmpeg rendering are
intentionally not implemented.
