# TaleMotion

TaleMotion is a cinematic video-production workspace organized as:

```text
frontend/   Next.js application (currently uses mock services)
backend/    FastAPI API, PostgreSQL persistence, and Celery worker
docs/       API contract and OpenAPI specification
```

The backend foundation persists projects, chapters, scenes, generation-job
metadata, assets, and renders. It does **not** yet implement Genblaze,
Backblaze B2, narration, scene media generation, FFmpeg rendering, or final
video production.

## Native infrastructure

PostgreSQL and Redis run as native Linux services:

```bash
systemctl status postgresql
systemctl status redis-server
psql --version
pg_isready
redis-cli ping
```

Copy `backend/.env.example` to `backend/.env` and supply local credentials.
When databases do not exist, create them manually without replacing existing
roles or databases:

```bash
sudo -u postgres psql
```

```sql
CREATE USER talemotion WITH PASSWORD 'development-password';
CREATE DATABASE talemotion_dev OWNER talemotion;
CREATE DATABASE talemotion_test OWNER talemotion;
```

The password above is an example for local development, not a committed
credential.

## Development

```bash
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

In another terminal:

```bash
cd backend
uv run celery -A app.core.celery_app worker \
  -Q storyboard,media,rendering,system --loglevel=info
```

The only task currently implemented is the safe
`app.tasks.system.database_worker_health` diagnostic. Start the frontend
separately with `cd frontend && pnpm dev`; it remains in mock API mode.

See [docs/api-contract.md](docs/api-contract.md) for implementation status and
the testing workflow.
