# TaleMotion Backend

FastAPI, PostgreSQL, Celery, Genblaze, Backblaze B2, and FFmpeg implementation
for the Historical Documentary MVP. The implemented workflow is deliberately
narrow: English, 30 or 45 seconds, vertical 9:16, four scenes, narration, and
captions.

## Local services

```bash
docker compose up -d postgres redis
cd backend
cp .env.example .env
uv sync
uv run alembic upgrade head
uv run fastapi dev app/main.py
```

Run the worker separately:

```bash
uv run celery -A app.core.celery_app worker \
  -Q storyboard,media,rendering --loglevel=info
```

Real generation requires `OPENAI_API_KEY` plus all `B2_*` values in `.env`.
Missing configuration returns an explicit `503`; it never produces fake
successful output. Secrets stay in the backend and must not use `NEXT_PUBLIC_`
variables.

## Verification

```bash
uv sync
uv run ruff check .
uv run pytest
```

Tests use isolated SQLAlchemy databases and injected fake external adapters.
The FFmpeg test creates and probes a real local MP4. A PostgreSQL migration can
be verified with `uv run alembic upgrade head`.

Worker entrypoints live in `app/tasks/`, orchestration in `app/pipelines/`, and
provider/storage/render adapters in `app/integrations/`. API and worker remain
separate processes sharing this codebase.
