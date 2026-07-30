# TaleMotion

TaleMotion is a cinematic video-production workspace organized as:

```text
frontend/   Next.js application with opt-in persisted generation workflows
backend/    FastAPI API, PostgreSQL persistence, and Celery worker
docs/       API contract and OpenAPI specification
```

The backend persists projects, validated four-scene historical storyboards,
parent/child generation jobs, and generated asset metadata. Celery workers use
Genblaze for GMICloud image/video generation and store media plus manifests in
Backblaze B2. Narration audio, music, captions, FFmpeg rendering, and final
video production are not implemented.

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

Workers run storyboard planning, scene media generation, and the safe
`app.tasks.system.database_worker_health` diagnostic. Start the frontend
separately with `cd frontend && pnpm dev`. Persisted storyboard and generation
actions are enabled only with `NEXT_PUBLIC_REAL_SCENE_GENERATION=true`; other
frontend features keep their existing mock boundary.

See [docs/api-contract.md](docs/api-contract.md) for implementation status and
the testing workflow.
